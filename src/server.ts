import e from "express";
import userRouter from "./routes/userRoute";
import helmet from "helmet";
import cors from "cors";
import http from "http";
import WsSingleton from "./socket logic/SocketSinglton";
import registerSocketHandlers from "./socket logic/socketConnection";
import blockListHandler from './routes/blockRoute'
const app = e();

const port = process.env.PORT || 5000;


const server = http.createServer(app);


const wss = WsSingleton.init(server)

registerSocketHandlers(wss)

// middlewares
app.use(e.json());
app.use(helmet());
app.use(cors());

// healthcheck
app.use("/health", (_req, res) => {
  res.json({ message: "hello world" });
});

// routes
app.use("/auth", userRouter);

app.use("/block-action", blockListHandler)

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});





