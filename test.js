

let WebSocketServer = require('ws').Server, wss = new WebSocketServer({port: 8070});

let PLAYERS=[];
let ROOMS = [];
let isRoomFull = 0;
let playerNum = 0;

let id = 1;

function Room(room_ID,room_IsLive, room_PlayersCapacity, room_SafeSquares,room_JoinedPlayers,room_Data) {
    this.room_ID = room_ID;
    this.room_IsLive = room_IsLive;
    this.room_PlayersCapacity = room_PlayersCapacity;
    this.room_SafeSquares = room_SafeSquares;
    this.room_JoinedPlayers = room_JoinedPlayers;
    this.room_Data = room_Data;
}

function Player(player_WS,player_ID,player_RoomID,player_Num) {
    this.player_WS = player_WS;
    this.player_ID = player_ID;
    this.player_RoomID = player_RoomID;
    this.player_Num = player_Num;
}

wss.SendDataToRoom = function broadcast(toRoomID, data, fromPlayer) {

    wss.clients.forEach(function each(client) {
        const pickedPlayer = PLAYERS[PLAYERS.findIndex(function getIndex(player) {
            return player.player_WS.id === client.id && player.player_RoomID === toRoomID;
        })];

        if(pickedPlayer && (pickedPlayer !== fromPlayer || fromPlayer === null)) {
            client.send(JSON.stringify(data));
        }
    });
};


wss.on('connection', function(ws, request, client) {

    ws.id = id;
    id++;

    print("Opened! " + "(User: " + ws.id + ")");

    ws.on('message', function(message) {

        print(message + "(User: " + ws.id + ")");

        let msg = JSON.parse(message);

        if(msg.__Type === "JoinToRoomReq"){

            if(!PLAYERS.find(e => e.player_ID === msg.PlayerID)){

                let pickedRoom = ROOMS[ROOMS.findIndex(function getIndex(value) {
                    return value.room_ID === msg.RoomID;
                })];

                if(pickedRoom){

                    if(pickedRoom.room_PlayersCapacity > pickedRoom.room_JoinedPlayers){

                        pickedRoom.room_JoinedPlayers++;

                        let newPlayer = new Player(ws, msg.PlayerID, msg.RoomID, pickedRoom.room_JoinedPlayers);

                        PLAYERS.push(newPlayer);

                        if(newPlayer){

                            ws.send(JSON.stringify({
                                "__Type": "JoinToRoomRes",
                                "RoomCapacity": pickedRoom.room_PlayersCapacity,
                                "SafeSquares": pickedRoom.room_SafeSquares,
                                "PlayerNumber": newPlayer.player_Num,
                                "Player": {
                                    "Name": "Ali",
                                    "Avatar": ""
                                }
                            }));

                        } else {

                            print("Error: An Error Has Occurred." + "(User: " + ws.id + ")");

                        }

                        if(pickedRoom.room_PlayersCapacity === pickedRoom.room_JoinedPlayers){

                            wss.SendDataToRoom(pickedRoom.room_ID,{
                                "__Type": "GameStart",
                                "Players": [
                                    {
                                        "Name": "Ali",
                                        "Avatar": ""
                                    },
                                    {
                                        "Name": "Mosi",
                                        "Avatar": ""
                                    },
                                ]
                            }, null);

                        }
                    } else{

                        print(" The Room is Full!" + "(User: " + ws.id + ")");

                    }

                } else {

                    let newRoom = new Room(msg.RoomID, 1, 3, 1, 0, {
                        "__Type":"RoomDataReq",
                        "Turn":0,
                        "Dice":0,
                        "GameState":null
                    });
                    ROOMS.push(newRoom);

                    newRoom.room_JoinedPlayers++;

                    let newPlayer = new Player(ws, msg.PlayerID, msg.RoomID, newRoom.room_JoinedPlayers);

                    PLAYERS.push(newPlayer);

                    if(newPlayer){

                        ws.send(JSON.stringify({
                            "__Type": "JoinToRoomRes",
                            "RoomCapacity": newRoom.room_PlayersCapacity,
                            "SafeSquares": newRoom.room_SafeSquares,
                            "PlayerNumber": newPlayer.player_Num,
                            "Player": {
                                "Name": "Ali",
                                "Avatar": ""
                            }
                        }));

                    } else {

                        print("Error: An Error Has Occurred." + "(User: " + ws.id + ")");

                    }

                }

            } else{

                print("Error: The Player Already Exists!" + "(User: " + ws.id + ")");

            }



        }

        if(msg.__Type === "DiceRolledReq") {

            let player = PLAYERS.find(e => e.player_WS.id === ws.id);

            if (player) {

                let room = ROOMS.find(e => e.room_ID === player.player_RoomID);

                if (room) {

                    wss.SendDataToRoom(player.player_RoomID, {
                        "Dice": msg.Dice,
                        "PlayerNumber": player.player_Num,
                        "__Type": "DiceRolledRes"
                    }, player);

                }

            }

        }

        if(msg.__Type === "RoomDataReq"){

            let player = PLAYERS.find(e => e.player_WS.id === ws.id);

            if(player){

                let room = ROOMS.find(e => e.room_ID === player.player_RoomID);

                if(room){

                    room.room_Data = msg;

                }

            }

        }

        if(msg.__Type === "PlayerBackReq"){

            let player = PLAYERS.find(e => e.player_WS.id === ws.id);

            if(player){

                let room = ROOMS.find(e => e.room_ID === player.player_RoomID);

                if(room){

                    room.room_Data.__Type = "PlayerBackRes";
                    ws.send(JSON.stringify(room.room_Data));

                }

            }

        }

        if(msg.__Type === "PlayerMovedReq"){

            let player = PLAYERS.find(e => e.player_WS.id === ws.id);

            if(player){

                let room = ROOMS.find(e => e.room_ID === player.player_RoomID);

                if(room) {

                    wss.SendDataToRoom(player.player_RoomID, {
                        "__Type": "PlayerMovedRes",
                        "PlayerNumber": player.player_Num,
                        "Pawn": msg.Pawn,
                        "StepCount": msg.StepCount
                    }, player);

                }

            }

        }

    });

    ws.on('close', function(message){

        print("Closed! " + "(User: " + ws.id + ")");
        const player = PLAYERS[PLAYERS.findIndex(function getIndex(value) {
            return value.player_WS === ws;
        })];

        const room = ROOMS[ROOMS.findIndex(function getIndex(value) {
            return value.room_ID === player.player_RoomID;
        })];

        PLAYERS.splice(PLAYERS.indexOf(player), 1);

        if(player.player_RoomID !== "") {
            let theIndex = ROOMS.indexOf(room);
            ROOMS[theIndex].room_JoinedPlayers--;
            if(ROOMS[theIndex].room_JoinedPlayers < 1) {
                ROOMS.splice(theIndex, 1);}
        }
    })

});

function print(message){

    let date = new Date();
    console.log("\n" +
        date.getHours() + ":" +
        date.getMinutes() + ":" +
        date.getSeconds() + ":" +
        date.getMilliseconds() + " => " +
        message);

}





