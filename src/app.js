import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import joi from "joi";
import dotenv from "dotenv";
import dayjs from 'dayjs';
import { stripHtml } from "string-strip-html";

const app = express();


app.use(express.json());
app.use(cors());
dotenv.config();


const mongoClient = new MongoClient(process.env.DATABASE_URL);
try {
    await mongoClient.connect();
    console.log("MongoDB conectado");
} catch {
    console.log(err.message);
}
const db = mongoClient.db();


const userSchema = joi.object({ name: joi.string().required() });

const messageShema = joi.object({
    from: joi.string().required(),
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid("message", "private_message").required()
});

app.post("/participants", async (req, res) => {
    const { name } = req.body;

    const cleanName = typeof name === "string" && stripHtml(name).result.trim();

    const validation = userSchema.validate({ name: cleanName }, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        return res.status(422).send(errors);
    };

    const timestamp = Date.now();
    const newUser = { name: cleanName, lastStatus: timestamp };

    const newMessageStatus = {
        from: cleanName,
        to: "Todos",
        text: "entra na sala...",
        type: "status",
        time: dayjs(timestamp).format("HH:mm:ss")
    };

    try {
        const existingUser = await db.collection("participants").findOne({ name: cleanName });
        if (existingUser) return res.status(409).send("Usuário já cadastrado");
        await db.collection("participants").insertOne(newUser);

        await db.collection("messages").insertOne(newMessageStatus);

        res.sendStatus(201);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get("/participants", async (req, res) => {

    try {
        const participants = await db.collection("participants").find().toArray()
        res.send(participants);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post("/messages", async (req, res) => {

    const { to, text, type } = req.body;
    const { user } = req.headers;

    const newMessageClear = {
        from: typeof user === "string" && stripHtml(user).result.trim(),
        to: typeof to === "string" && stripHtml(to).result.trim(),
        text: typeof text === "string" && stripHtml(text).result.trim(),
        type: typeof type === "string" && stripHtml(type).result.trim(),

    }

    const validation = messageShema.validate(newMessageClear, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        return res.status(422).send(errors);
    }


    try {
        const participantExists = await db.collection("participants").findOne({ name: newMessageClear.from });
        if (!participantExists) return res.sendStatus(422);

        const newMessage = { ...newMessageClear, time: dayjs().format("HH:mm:ss") }
        await db.collection("messages").insertOne(newMessage);
        res.sendStatus(201);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get("/messages", async (req, res) => {
    const { user } = req.headers;
    const { limit } = req.query;
    const numberLimit = Number(limit)

    if (limit !== undefined && (isNaN(numberLimit) || numberLimit < 1)) return res.sendStatus(422);

    try {
        const messages = await db.collection("messages")
            .find({ $or: [{ type: "message" }, { to: { $in: ["Todos", user] } }, { from: user }] })
            .limit(limit === undefined ? 0 : numberLimit)
            .sort(({ $natural: -1 }))
            .toArray();
        res.send(messages);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post("/status", async (req, res) => {
    const { user } = req.headers;

    if (!user) return res.sendStatus(404);

    try {
        const result = await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
        if (result.matchedCount === 0) return res.sendStatus(404);

        res.sendStatus(200);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete("/messages/:id", async (req, res) => {
    const { user } = req.headers;
    const { id } = req.params;

    if (!user) return res.status(400).send("User é obrigatório");

    try {
        const message = await db.collection("messages").findOne({ _id: new ObjectId(id) });
        if (!message) return res.sendStatus(404);

        if (message.from !== user) return res.sendStatus(401);

        const result = await db.collection("messages").deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.sendStatus(404);
        res.sendStatus(204);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put("/messages/:id", async (req, res) => {
    const { to, text, type } = req.body;
    const { user } = req.headers;
    const { id } = req.params;

    const validation = messageShema.validate({ ...req.body, from: user }, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        return res.status(422).send(errors);
    };

    try {
        const participantExists = await db.collection("participants").findOne({ name: user });
        if (!participantExists) return res.sendStatus(422);

        const existingMessage = await db.collection("messages").findOne({ _id: new ObjectId(id) });
        if (!existingMessage) return res.sendStatus(404);

        if (existingMessage.from !== user) return res.sendStatus(401);

        const result = await db.collection("messages").updateOne({ _id: new ObjectId(id) }, { $set: req.body });

        if (result.matchedCount === 0) {
            return res.status(404).send("Esse usuário não existe!");
        }

        res.sendStatus(200);

    } catch (err) {
        res.status(500).send(err.message);
    }

});

setInterval(async () => {
    const tenSecondsAgo = Date.now() - 10000;

    try {
        const inactive = await db.collection("participants")
            .find({ lastStatus: { $lt: tenSecondsAgo } })
            .toArray();

        if (inactive.length > 0) {
            const messages = inactive.map(inactive => {
                return {
                    from: inactive.name,
                    to: "Todos",
                    text: "sai da sala...",
                    type: "status",
                    time: dayjs().format("HH:mm:ss")
                }
            });
            await db.collection("messages").insertMany(messages);
            await db.collection("participants").deleteMany({ lastStatus: { $lt: tenSecondsAgo } });
        }

    } catch (err) {
        console.log(err.message);

    }
}, 15000)

const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));