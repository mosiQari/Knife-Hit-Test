let WebSocketServer = require('ws').Server
let wss = new WebSocketServer({ port: 8070 })
let PLAYERS = []
let ROOMS = []
let CAPACITY = 2
let timeout = 10000
let timer

function Room(id, capacity, data) {
    this.id = id
    this.capacity = capacity
    this.players = []
    this.data = data
}

function Player(ws, id, roomId, num) {
    this.ws = ws
    this.id = id
    this.roomId = roomId
    this.num = num
    this.ready = 0
    this.deleted = 0
    this.level = 1
    this.hits = 0
}

wss.on('connection', function (ws, request, client) {

    print("Opened!")

    ws.on('message', function (message) {

        print(message)

        let msg = JSON.parse(message)

        if (msg.__Type === "JoinToRoomReq") {

            let room = ROOMS.find(e => e.id === msg.RoomID)

            if (room) {

                let player = room.players.find(e => e.id === msg.PlayerID)


                if (player) { //The old player should not send <JoinToRoomReq>

                    //Before, The disconnected user could reconnect from here.
                    //But now the codes of that action migrated to the <PlayerBackReq>
                    ws.send("The player Already Exists!")


                } else { //New player

                    if (room.capacity > room.players.length) { //The room is not full

                        let player = new Player(ws, msg.PlayerID, msg.RoomID, room.players.length + 1)

                        room.players.push(player)

                        PLAYERS.push(player)

                        if (player) {

                            ws.send(JSON.stringify({
                                "__Type": "JoinToRoomRes",
                                "Settings": {
                                    "Capacity": room.capacity
                                },
                                "PlayerNumber": player.num,
                                "Player": {
                                    "Nickname": "Ali",
                                    "Avatar": 254
                                }
                            }))

                        } else {

                            print("Error: An Error Has Occurred.")

                        }


                        if (room.capacity === room.players.length) { //All the players joined

                            room.players.forEach(function (player) {

                                player.ready = 1

                            })

                            wss.SendDataToRoom(room.id, {
                                "__Type": "GameStart",
                                "Players": [{
                                    "Nickname": "Ali",
                                    "Avatar": ""
                                },
                                {
                                    "Nickname": "Mosi",
                                    "Avatar": ""
                                },
                                ]
                            }, null)

                            //And startTimer at the beginning of the game
                            startTimer(room)

                        }

                    } else { //The room is full

                        print("The Room is Full!")

                    }

                }


            } else { //The Room doesn't exist. Create a room.

                let room = new Room(msg.RoomID, CAPACITY, {
                    "__Type": "PlayerBackRes",
                    "GameState": [{ Level: 1 }, { Level: 1 }]
                })

                ROOMS.push(room)

                //The player is the room's creator
                let player = new Player(ws, msg.PlayerID, msg.RoomID, room.players.length + 1)
                room.players.push(player)
                PLAYERS.push(player)

                if (player) {
                    ws.send(JSON.stringify({
                        "__Type": "JoinToRoomRes",
                        "Settings": {
                            "Capacity": room.capacity
                        },
                        "PlayerNumber": player.num,
                        "Player": {
                            "Nickname": "Ali",
                            "Avatar": 254
                        }
                    }))
                } else {
                    print("Error: An Error Has Occurred.")
                }

            }

        } else if (msg.__Type === "GameStateUpdateReq") { //Updating game state req

            let player = PLAYERS.find(e => e.ws === ws)
            if (player && player.ready) {

                let room = ROOMS.find(e => e.id === player.roomId)
                if (room) {

                    player.level = msg.Level
                    player.hits = msg.Hits

                    sendGameStateUpdateRes(player.level, player.hits, msg.AddKnife, room.players, player)
                    updateRoomData(room, player, player.level)

                }
            }

        } else if (msg.__Type === "PlayerBackReq") {

            let player = PLAYERS.find(e => e.ws === ws)

            if (player && !player.deleted) {

                if (player.ready) {

                    let room = ROOMS.find(e => e.id === player.roomId)

                    if (room) {

                        room.data.__Type = "PlayerBackRes"
                        ws.send(JSON.stringify(room.data))

                    }
                } else {

                    let room = ROOMS.find(e => e.id === msg.RoomID)

                    if (room) {

                        let player = room.players.find(e => e.id === msg.PlayerID)

                        if (player) {

                            player.ready = 1
                            player.ws = ws

                            room.data.__Type = "PlayerBackRes"
                            ws.send(JSON.stringify(room.data))

                        }

                    }

                }

            } else if (!player.deleted) {

                //Duplicate

                let room = ROOMS.find(e => e.id === msg.RoomID)

                if (room) {

                    let player = room.players.find(e => e.id === msg.PlayerID)

                    if (player) {

                        player.ready = 1
                        player.ws = ws

                        room.data.__Type = "PlayerBackRes"
                        ws.send(JSON.stringify(room.data))

                    }

                }

            }

        } else if (msg.__Type === "ResignReq") {

            let player = PLAYERS.find(e => e.ws === ws)

            if (player && !player.deleted && player.ready) {

                let room = ROOMS.find(e => e.id === player.roomId)

                if (room) {

                    wss.SendDataToRoom(player.roomId, {
                        "__Type": "ResignUpdate",
                        "PlayerNumber": player.num
                    }, player)

                    player.deleted = 1

                }

            }

        }

    })

    ws.on('close', function (message) {

        /*print("Closed!")

        let player = PLAYERS.find(e => e.ws === ws)

        if (player) {

            player.ready = 0

        } else {

            print("The User Doesn't Exists!")

        }*/

        PLAYERS.forEach(function (player) {
            player = null
        })

        ROOMS.forEach(function (room) {
            room = null
        })

        PLAYERS = []
        ROOMS = []

        clearTimeout(timer)


    })

})

wss.SendDataToRoom = function broadcast(toRoomID, data, fromPlayer) {

    if ((fromPlayer && !fromPlayer.deleted) || fromPlayer === null) {

        wss.clients.forEach(function each(client) {

            let player = PLAYERS.find(e => (e.ws === client) && (e.roomId === toRoomID))

            if (player && (player !== fromPlayer || fromPlayer === null) && player.ready && !player.deleted) {
                client.send(JSON.stringify(data))
            }
        })

    } else {

        wss.client.send("Unauthorized Request!")

    }
}

function print(message) {

    let date = new Date()
    console.log("\n" +
        date.getHours() + ":" +
        date.getMinutes() + ":" +
        date.getSeconds() + ":" +
        date.getMilliseconds() + " => " +
        message)

}

function startTimer(room) {//After timeout gives winner of the room

    clearTimeout(timer)

    timer = setTimeout(function () {

        let winner = selectWinner(room)
        console.log(winner)

        if (winner) {//If one of players wins

            room.players.forEach(function (player) {
                player.ws.send(JSON.stringify({
                    __Type: "EndGameRes",
                    PlayerNumber: winner.num,
                    Level: winner.level,
                    Hits: winner.hits
                }))

            })

        } else {//If draw

            room.players.forEach(function (player) {
                player.ws.send(JSON.stringify({
                    __Type: "EndGameRes",
                    PlayerNumber: -1,
                    Level: player.level,
                    Hits: player.hits
                }))

            })

        }

    }, timeout)

}

function sendGameStateUpdateRes(level, hits, addKnife, players, sender) {//sender = null => send to all

    players.forEach(function (player) {

        if (player != sender) {

            player.ws.send(JSON.stringify({
                __Type: "GameStateUpdateRes",
                Level: level,
                Hits: hits,
                AddKnife: addKnife
            }))
        }

    })

}

function updateRoomData(room, player, data) {//Updating room data with latest data sent from players

    if (room) {

        room.data.GameState[player.num - 1] = { Level: data }
        return true

    }

    return false

}

function selectWinner(room) {

    let winner = null
    room.players.forEach(function (player) {

        if (winner != null) {

            if (player.level === winner.level) {//Equal levels

                if (player.hits === winner.hits) {//Equal hits

                    winner = 0

                } else if (player.hits > winner.hits) {//Bigger hits

                    winner = player
                }

            } else if (player.level > winner.level) {//Bigger level

                winner = player

            }

        } else {//First loop round

            winner = player

        }

    })
    
    return winner

}