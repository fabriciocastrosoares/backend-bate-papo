import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import joi from "joi";
import dotenv from "dotenv";
import dayjs from 'dayjs';

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

app.post("/participants", async (req, res) => {
    const { name } = req.body;

    const userSchema = joi.object({
        name: joi.string().required()
    });
    const validation = userSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        return res.status(422).send(errors);
    };

    const newUser = { name, lastStatus: Date.now() };

    const newMessageStatus = {
        from: name,
        to: "Todos",
        text: "entra na sala...",
        type: "status",
        time: dayjs().format("HH:mm:ss")
    };

    try {
        const existingUser = await db.collection("participants").findOne({ name: name });
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
        const participant = await db.collection("participants").find().toArray()
        res.send(participant);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post("/messages", async (req, res) => {

    const { to, text, type } = req.body;
    const { from } = req.headers;

    const messageShema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid("message", "private_message").required()
    });
    const validation = messageShema.validate(req.body, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        return res.status(422).send(errors);
    }

    const newMessage = {
        from,
        to,
        text,
        type,
        time: dayjs().format("HH:mm:ss")
    }
    try {
        const participantExists = await db.collection("participants").findOne({ name: from });
        if (!participantExists) return res.sendStatus(422);
        await db.collection("messages").insertOne(newMessage);
        res.sendStatus(201);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get("/messages", async (req, res) => {
    const limit = Number(req.query.limit);
    const user = req.header("User");

    if (req.query.limit && (isNaN(limit) || limit < 1)) {
        return res.sendStatus(422);
    }
    try {
        const messages = await db.collection("messages").find({
            $or: [
                { type: "message" },
                { to: "Todos" },
                { to: user },
                { from: user }
            ]
        })
            .limit(limit || 0)
            .toArray();
        res.send(messages);
    } catch (err) {
        res.sendStatus(500);
    }
});

app.post("/status", async (req, res) => {
    const { user } = req.headers;
    const updateUser = { name: user, lastStatus: Date.now() }
    console.log(user);
    if (!user) return res.sendStatus(404);
    try {
        const existingUser = await db.collection("participants").findOne({ name: user });
        if (!existingUser) return res.sendStatus(404);
        await db.collection("participants").updateOne({ name: user }, { $set: updateUser });
        res.sendStatus(200);
    } catch {
        res.sendStatus(500);
    }

})

const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));