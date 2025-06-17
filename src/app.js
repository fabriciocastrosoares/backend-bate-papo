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

let db;
const mongoClient = new MongoClient(process.env.DATABASE_URL);
mongoClient.connect()
    .then(() => db = mongoClient.db())
    .catch((err) => console.log(err.message));

app.post("/participants", async (req, res) => {
    const { name } = req.body;

    if (!name || typeof name !== "string") {
        return res.status(422).send("Seu nome é obrigatório!");
    }

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
    const {from} = req.headers;

    if (!to || typeof to !== "string" || !text || typeof text !== "string" || (type !== "message") && (type !== "private_message")) {
        return res.status(422).send("É obrigatório escolher o destinátário e não pode conter uma menssagem vazia!");
    }

    const newMessage = {
        from,
        to,
        text,
        type,
        time: dayjs().format("HH:mm:ss")
    }
    try{
        const participantExists = await db.collection("participants").findOne({ name: from });
        if (!participantExists) return res.sendStatus(422);
        await db.collection("messages").insertOne(newMessage);
        res.sendStatus(201);
    }catch (err){
        res.status(500).send(err.message);
    }
});

app.get("/messages", async (req, res) => {

});

const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));