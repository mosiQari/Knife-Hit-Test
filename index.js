let WebSocketServer = require('ws').Server,
    wss = new WebSocketServer({ port: 8070 })
let PLAYERS = []
let ROOMS = []
let CAPACITY = 2
let timeout = 10000
let setShipsTimeout = 1500000
let timer, startTime, setShipsTimer

function Room(id, capacity, data) {
    this.id = id
    this.capacity = capacity
    this.players = []
    this.data = data
}

function Player(ws, id, roomId, num, ready, absence, deleted) {
    this.ws = ws
    this.id = id
    this.roomId = roomId
    this.num = num
    this.ready = 0
    this.absence = 0
    this.deleted = 0
    this.setShips = 0
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

                            room.players.forEach(function (ply) {

                                ply.ready = 1

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

                            //And startTimer for the player at the beginning of the game
                            startSetShipsTimer(room)

                        }

                    } else { //The room is full

                        print("The Room is Full!")

                    }

                }


            } else { //The Room doesn't exist

                let room = new Room(msg.RoomID, CAPACITY, {
                    "__Type": "RoomDataRes",
                    "Ships": [],
                    "Board": [],
                    "Turn": 1,
                    "ElapsedTime": 0.00
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
        
        } else if (msg.__Type === "SetShipsReq"){
            
            let player = PLAYERS.find(e => e.ws === ws)
            if (player && player.ready) {

                let room = ROOMS.find(e => e.id === player.roomId)
                if (room) {
                    
                    player.setShips = 1 //Tag player that he set his ships (setShipsTimer)

                    player.ships = msg.Ships
                    let x = 0
                    let ships = []

                    room.players.forEach(function (p, i) {
                        if ("ships" in p) {
                            ++x
                            ships[i] = p.ships
                            if (x === 2) { //All the players sent their ships? If yes, send them <GameStateUpdateRes> and start timer
                                room.players.forEach(function (player) {
                            
                                    player.ws.send(JSON.stringify({
                                        __Type: "SetShipsRes",
                                        Ships: ships
                                    }))
                            
                                })
                                //Start calculate the player absence #1
                                let turnedPlayer = room.players.find(e => e.ws != ws) // Select opponent
                                startTimer(turnedPlayer, room)
                            }
                        }
                    })
                }
                
            }
        
        } else if (msg.__Type === "GameStateUpdateReq") { //This is updating game state req

            let player = PLAYERS.find(e => e.ws === ws)
            if (player && player.ready) {

                let room = ROOMS.find(e => e.id === player.roomId)
                if (room) {

                    if (msg.TouchedCell > 0 && typeof msg.TouchedCell === "number") { //This is a touching cell request

                        if (msg.Board.length === 2) { //Updating board message. A response will be sent to the opponent that notifies him about touching cells.

                            sendGameStateUpdateRes(msg.Ships, msg.Board, msg.TouchedCell, msg.Turn, room.players, player)
                            updateRoomData(room, msg)

                            //Start calculate the player absence #2
                            let turnedPlayer = room.players.find(e => e.ws != ws) //Select opponent
                            startTimer(turnedPlayer, room)

                        } else {

                            ws.send("3: The request is not correct!")

                        }

                    } else {

                        ws.send("4: The request is not correct!")

                    }
                }
            }

        } else if (msg.__Type === "PlayerBackReq") {

            let player = PLAYERS.find(e => e.ws === ws)

            if (player && !player.deleted) {

                if (player.ready) {

                    let room = ROOMS.find(e => e.id === player.roomId)

                    if (room) {

                        room.data.__Type = "PlayerBackRes"
                        room.data.ElapsedTime = (new Date().getTime() - startTime) / 1000
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

        } else if (msg.__Type === "EndGameReq") {

            let player = PLAYERS.find(e => e.ws === ws)

            if (player && !player.deleted && player.ready) {

                let room = ROOMS.find(e => e.id === player.roomId)

                if (room) {

                    room = null
                    console.log("The room is closed!")

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

function nextTurn(players, turn) {

    let presentPlayers = []

    players.forEach(function (player, i) {
        if (!player.deleted) {
            presentPlayers[i] = player.num
        }
    })

    let index = presentPlayers.indexOf(turn)

    if (index >= presentPlayers.length - 1)
        index = 0
    else
        index++

    return presentPlayers[index]

}

function startTimer(player, room) {

    if (player && !player.deleted) {

        clearTimeout(timer)
        startTime = (new Date()).getTime()

        timer = setTimeout(function () {

            player.absence++
            console.log(player.num + " Absence: " + player.absence)

            let newTurn = nextTurn(room.players, room.data.Turn)

            wss.SendDataToRoom(player.roomId, {
                "__Type": "TurnSkipped",
                "Turn": newTurn
            }, null)

            room.data.Turn = newTurn
            room.data.ElapsedTime = 0

            if (player.absence >= 3) {

                player.deleted = 1

                wss.SendDataToRoom(player.roomId, {
                    "__Type": "ResignUpdate",
                    "PlayerNumber": player.num
                }, null)

                console.log(player.num + ": OUT!")
            }

            //start new round for next player
            let playerNum = nextTurn(room.players, room.data.Turn)
            clearTimeout(timer)
            startTimer(room.players.find(e => e.num === playerNum), room)

        }, timeout, player)
    }

}

function startSetShipsTimer(room) {

    clearTimeout(setShipsTimer)
    
    setShipsTimer = setTimeout(function () {
        
        room.players.forEach(function(player){
            
            if(!player.setShips){
            
                let opponent = room.players.find(e => e.ws != player.ws)
                player.deleted = 1
                player.ready = 0
                
                opponent.ws.send(JSON.stringify({
                    __Type: "ResignUpdate"
                }))
                
            }
            
        })

    }, setShipsTimeout)

}

function sendGameStateUpdateRes(ships, board, touchedCell, turn, players, sender) {//sender = null => send to all

    players.forEach(function (player) {

        if (player != sender) {

            player.ws.send(JSON.stringify({
                __Type: "GameStateUpdateRes",
                Ships: ships,
                Board: board,
                TouchedCell: touchedCell,
                Turn: turn
            }))
        }

    })

}

function updateRoomData(room, data) {//Updating room data with latest data sent from players

    if (room) {

        room.data = {
            Ships: data.Ships,
            Board: data.Board,
            Turn: data.Turn
        }

        return true

    }

    return false

}