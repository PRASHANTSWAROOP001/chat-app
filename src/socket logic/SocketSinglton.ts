import WebSocket from "ws";
import {Server} from "http"

// WebSocket SingletoClass To Create A Single Web Socket Server

class WsSingleton{
    private static instance:WebSocket.Server;

    static init(server:Server){

        if (!WsSingleton.instance){
            WsSingleton.instance = new WebSocket.Server({server})
        }
        return WsSingleton.instance

    }

    static getInstance(){
        if(!WsSingleton.instance){
            throw new Error("WSS not intialized.")
        }
        return WsSingleton.instance
    }
}

export default WsSingleton;