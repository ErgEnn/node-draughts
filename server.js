"use strict";
process.title = 'checkers';
var webSocketsServerPort = 3001;
var webSocketServer = require('websocket').server;
var http = require('http');
const uuidv1 = require('uuid/v1');
var server = http.createServer(function (request, response) {
	response.statusCode = 200;
	response.setHeader('Content-Type', 'text/plain');
	response.end('Hello World!\n');
});
server.listen(webSocketsServerPort, function () {
	console.log((new Date()) + " Server is listening on port " + webSocketsServerPort);
});
var wsServer = new webSocketServer({
	httpServer: server
});


var games = {};

function generateNewGame(json) {
	var gameId = uuidv1();
	games[gameId] = {
		player1: null,
		player2: null,
		turn: 0,
		board: {
			"black-checker-0": "black-cell-1",
			"black-checker-1": "black-cell-3",
			"black-checker-2": "black-cell-5",
			"black-checker-3": "black-cell-7",
			"black-checker-4": "black-cell-8",
			"black-checker-5": "black-cell-10",
			"black-checker-6": "black-cell-12",
			"black-checker-7": "black-cell-14",
			"black-checker-8": "black-cell-17",
			"black-checker-9": "black-cell-19",
			"black-checker-10": "black-cell-21",
			"black-checker-11": "black-cell-23",

			"white-checker-0": "black-cell-40",
			"white-checker-1": "black-cell-42",
			"white-checker-2": "black-cell-44",
			"white-checker-3": "black-cell-46",
			"white-checker-4": "black-cell-49",
			"white-checker-5": "black-cell-51",
			"white-checker-6": "black-cell-53",
			"white-checker-7": "black-cell-55",
			"white-checker-8": "black-cell-56",
			"white-checker-9": "black-cell-58",
			"white-checker-10": "black-cell-60",
			"white-checker-11": "black-cell-62"
		},
		kings: [],
		inProgress: null,
		markedForDeletion: []
	};
	return gameId;
}

function joinGame(gameId, connection) {
	if (!(gameId in games)) {
		connection.sendUTF(JSON.stringify({
			reason: "error", data: {
				type: "no-game-with-given-id-exists",
			}
		}));
		return null;
	}
	var color = "BLACK";
	if (games[gameId].player1 === null) {
		games[gameId].player1 = connection;
		color = "BLACK";
	} else if (games[gameId].player2 === null) {
		games[gameId].player2 = connection;
		color = "WHITE";
	} else {
		connection.sendUTF(JSON.stringify({
			reason: "error", data: {
				type: "game-full",
			}
		}));
		return null;
	}

	connection.sendUTF(JSON.stringify({
		reason: "joinedGame", data: {
			gameId: gameId,
			board: games[gameId].board,
			turn: games[gameId].turn,
			color: color
		}
	}));

	if (games[gameId].player1 === null || games[gameId].player2 === null) {
		connection.sendUTF(JSON.stringify({
			reason: "waitingForOpponent", data: {
				gameId: gameId
			}
		}));
	} else {
		games[gameId].player1.sendUTF(JSON.stringify({
			reason: "opponentJoined", data: {
				gameId: gameId
			}
		}));
		games[gameId].player2.sendUTF(JSON.stringify({
			reason: "opponentJoined", data: {
				gameId: gameId
			}
		}));
	}
	return gameId
}

function isOccupied(square, game) {
	for (const [key, value] of Object.entries(game.board)) {
		if (value === square) {
			return true;
		}
	}
	return false;
}

function isCoordOccupied(coords, game) {
	return isOccupied(getSquareByCoords(coords), game);
}

function getCheckerAt(square, game) {
	if (square === null) return null;
	for (const [key, value] of Object.entries(game.board)) {
		if (value === square) {
			return key;
		}
	}
	return null;
}

function getSquareByCoords(coords) {
	if (coords[0] < 0 || coords[0] > 7 || coords[1] < 0 || coords[1] > 7) {
		return null;
	}
	var id = coords[1] * 8 + coords[0];
	var color = coords[1] % 2 + coords[0] % 2 === 0 ? "white" : "black";
	return color + "-cell-" + id;
}

function squareIndex(square) {
	return parseInt(square.substring(11), 10);
}

function isKing(checker, game) {
	return game.kings.includes(checker);
}

function getValidDirections(checker, game) {
	if (isKing(checker, game)) {
		return [[-1, -1], [1, -1], [-1, 1], [1, 1]];
	}
	if (checker.startsWith("black-checker")) {
		return [[-1, 1], [1, 1]];
	}
	if (checker.startsWith("white-checker")) {
		return [[-1, -1], [1, -1]];
	}
}


function getValidSquares(checker, game) {
	var directions = getValidDirections(checker, game);
	var curSquare = game.board[checker];

	if (curSquare.startsWith("graveyard")) return {};

	var curCoords = getCoords(curSquare);

	var result = {};
	var hasKill = game.inProgress !== null;
	for (var direction in directions) {
		var moveCoords = [curCoords[0] + directions[direction][0], curCoords[1] + directions[direction][1]]
		var moveSquare = getSquareByCoords(moveCoords);
		if (moveSquare === null) continue; //ignore, coord out of bounds

		var occupyingChecker = getCheckerAt(moveSquare, game);
		if (occupyingChecker === null && !hasKill) { //square empty and valid for move
			result[moveSquare] = null;
			continue;
		} else if (occupyingChecker !== null && isEnemyChecker(checker, occupyingChecker)) {
			var jumpCoords = [moveCoords[0] + directions[direction][0], moveCoords[1] + directions[direction][1]];
			var jumpSquare = getSquareByCoords(jumpCoords);
			if (jumpSquare === null) { //no square to jump to
				continue;
			} else if (isOccupied(jumpSquare, game)) { //jump square is occupied
				continue;
			} else if (game.markedForDeletion.includes(occupyingChecker)) { // checker is already killed
				continue
			}
			else { //jump possible
				if (!hasKill) {
					result = {};
					hasKill = true;
				}
				result[jumpSquare] = occupyingChecker;
			}
		}
	}
	return result;
}

function hasKillMoves(squares) {
	for (const [key, value] of Object.entries(squares)) {
		if (value !== null) {
			return true;
		}
	}
	return false;
}

function getCoords(square) {
	var id = squareIndex(square);
	var y = parseInt(id / 8, 10);
	var x = id % 8;
	return [x, y];
}

function canPlayerMove(checker, game, connection) {
	if (game.turn % 2 === 0 && connection === game.player1 && checker.startsWith("black-checker")) {
		return true;
	}
	if (game.turn % 2 === 1 && connection === game.player2 && checker.startsWith("white-checker")) {
		return true;
	}
	return false
}

function isEnemyChecker(moveChecker, killedChecker) {
	return moveChecker[0] !== killedChecker[0];
}

function showPossibleMoves(checker, gameId, connection) {
	var game = games[gameId];
	if (!canPlayerMove(checker, game, connection)) {
		return;
	}
	if (!isCheckerMovable(checker, game)) {
		return;
	}
	var validSquares = Object.keys(getValidSquares(checker, game));
	var validMoves = JSON.stringify({
		reason: "validMoves", data: {
			moves: validSquares
		}
	});
	connection.sendUTF(validMoves);
}

function getMovableCheckers(game) {
	var result = [];
	var hasKills = false;
	var isP1Turn = game.turn % 2 === 0;
	for (var checker in game.board) {
		var isP1Checker = checker.startsWith("black-checker");
		if (isP1Checker === isP1Turn) {
			var square = game.board[checker];
			if (square.startsWith("graveyard")) continue;
			var validSquares = getValidSquares(checker, game);
			if (Object.entries(validSquares).length === 0 && validSquares.constructor === Object) {
				continue
			}
			if (hasKillMoves(validSquares)) {
				if (hasKills) {
					result.push(checker);
				} else {
					result = [checker];
					hasKills = true;
				}
			} else if (!hasKills) {
				result.push(checker);
			}
		}
	}

	return result;
}

function isCheckerMovable(checker, game) {
	if (game.inProgress !== null) {
		if (game.inProgress === checker) {
			return true;
		}
		return false;
	}
	var movableCheckers = getMovableCheckers(game);
	for (var movableChecker in movableCheckers) {
		if (checker === movableCheckers[movableChecker]) {
			return true;
		}
	}
	return false;
}

function killChecker(checker, game) {
	if (checker.startsWith("black-checker")) {
		game.board[checker] = "graveyard-black";
	} else {
		game.board[checker] = "graveyard-white";
	}
	var move = JSON.stringify({
		reason: "move", data: {
			checker: checker,
			square: game.board[checker],
			turn: game.turn,
			markedForDeletion: [],
			movableCheckers: [],
			kings: []
		}
	});
	game.player1.sendUTF(move);
	game.player2.sendUTF(move);
}

function canPromote(checker, game) {
	var coords = getCoords(game.board[checker]);
	if (checker.startsWith("black-checker") && coords[1] === 7) {
		return true;
	}
	if (checker.startsWith("white-checker") && coords[1] === 0) {
		return true;
	}
	return false;
}

function moveMade(move, gameId, connection) {
	var game = games[gameId];
	var checker = move.checker;
	var newSquare = move.square;
	if (!canPlayerMove(checker, game, connection)) {
		return;
	}
	if (!isCheckerMovable(checker, game)) {
		return;
	}
	var validSquares = getValidSquares(checker, game);
	if (!(newSquare in validSquares)) {
		return;
	}
	var killedChecker = validSquares[newSquare];
	if (killedChecker === null) {
		game.turn++;
		game.board[checker] = newSquare;
		if (canPromote(checker, game)) {
			game.kings.push(checker);
		}
	} else {
		game.markedForDeletion.push(killedChecker);
		game.inProgress = checker;
		game.board[checker] = newSquare;
		validSquares = getValidSquares(checker, game);
		if (Object.entries(validSquares).length === 0 && validSquares.constructor === Object) {
			game.turn++;
			game.inProgress = null;
			for (var killed in game.markedForDeletion) {
				killChecker(game.markedForDeletion[killed], game);
			}
			game.markedForDeletion = [];
			if (canPromote(checker, game)) {
				game.kings.push(checker);
			}
		}
	}
	var moveableCheckers = getMovableCheckers(game);
	var move = JSON.stringify({
		reason: "move", data: {
			checker: checker,
			square: newSquare,
			turn: game.turn,
			markedForDeletion: game.markedForDeletion,
			movableCheckers: moveableCheckers,
			kings: game.kings
		}
	});
	game.player1.sendUTF(move);
	game.player2.sendUTF(move);

	if (moveableCheckers.length === 0) {
		var winner = (game.turn - 1) % 2 === 0 ? "black" : "white";
		var gameOver = JSON.stringify({
			reason: "gameOver", data: {
				winner: winner,
			}
		});
		game.player1.sendUTF(gameOver);
		game.player2.sendUTF(gameOver);
	}

}

wsServer.on('request', function (request) {
	console.log((new Date()) + ' Connection from origin ' + request.origin + '.');
	var connection = request.accept(null, request.origin);

	console.log((new Date()) + ' Connection accepted.');

	var gameId = null;

	connection.on('message', function (message) {
		console.log(gameId + " " + message.utf8Data);
		try {
			var json = JSON.parse(message.utf8Data);
		} catch (e) {
			console.log('This doesn\'t look like a valid JSON: ', message.data);
			return;
		}
		if (json.reason === "startNewGame") {
			gameId = generateNewGame(json, connection);
			joinGame(gameId, connection);
		} else if (json.reason === "joinGame") {
			gameId = joinGame(json.data.gameId, connection);
		} else if (json.reason === "move") {
			moveMade(json.data, gameId, connection);
		} else if (json.reason === "moveStart") {
			showPossibleMoves(json.data.checker, gameId, connection);
		}

	});
	connection.on('close', function (reason) {
		console.log((new Date()) + ' Connection closed. ' + gameId);
		if (gameId !== null) {
			var game = games[gameId];
			if (game.player1 !== null && game.player1.closeReasonCode === reason) {
				game.player1 = null;
				if (game.player2 === null) return;
				game.player2.sendUTF(JSON.stringify({
					reason: "waitingForOpponent", data: {
						gameId: gameId
					}
				}));
			}
			if (game.player2 !== null && game.player2.closeReasonCode === reason) {
				game.player2 = null;
				if (game.player1 === null) return;
				game.player1.sendUTF(JSON.stringify({
					reason: "waitingForOpponent", data: {
						gameId: gameId
					}
				}));
			}

		}
	});
});
