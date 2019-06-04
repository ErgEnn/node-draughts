$(window).on('load',function(){
	$('#newGameModal').modal('show');

	$(".checker").on("dragstart",function (ev) {
		ev.originalEvent.dataTransfer.setData("checker", ev.originalEvent.target.id);
		connection.send(JSON.stringify({reason:"moveStart",data:{
			checker:ev.originalEvent.target.id
		}}));
	});

	$(".square").on("drop",function (ev) {
		ev.preventDefault();
		connection.send(JSON.stringify({reason:"move",data:{
			checker:ev.originalEvent.dataTransfer.getData("checker"),
			square:ev.originalEvent.target.id
		}}));
		$(".mark").removeClass("mark");
	});

	$(".square").on("dragover",function (ev) {
		ev.preventDefault();
	});

	$("#gameId").focus(function () {
		$(this).select();
	});

	$("#gameIdInput").on("paste change keyup",function () {
		console.log($(this).val().length);
		if($(this).val().length==36){
			$("#joinGameBtn").prop("disabled",false);
		}else{
			$("#joinGameBtn").prop("disabled",true);
		}
	});

	$("#gameIdInput").focus(function () {
		$(this).select();
	});
	
	function fullBoard(board) {
		for (const [key, value] of Object.entries(board)) {
			document.getElementById(value).appendChild(document.getElementById(key));
		}
	}

	var myColor = null;

	window.WebSocket = window.WebSocket || window.MozWebSocket;

	// open connection
	var connection = new WebSocket('ws://46.101.187.36');

	connection.onmessage = function (message) {
		try {
			var json = JSON.parse(message.data);
		} catch (e) {
			console.log('This doesn\'t look like a valid JSON: ', message.data);
			return;
		}
		console.log(json);

		if(json.reason==="joinedGame"){
			fullBoard(json.data.board);
			var color = "Mustade";
			if(json.data.turn%2==1){
				color="Valgete"
			}
			if(json.data.color==="BLACK"){
				$(".checker .white").prop("draggable",false);
				$("#yourColor").html("Sina oled MUST");
				myColor = "black";
			}else{
				$(".checker .black").prop("draggable",false);
				$("#yourColor").html("Sina oled VALGE");
				myColor = "white";
			}
			$("#turnInfo").html(color+" käik");
			$('#newGameModal').modal('hide');
		}
		else if(json.reason==="waitingForOpponent"){
			$("#gameId").val(json.data.gameId);
			$('#waitingOtherModal').modal('show');
		}
		else if(json.reason==="opponentJoined"){
			$('#waitingOtherModal').modal('hide');
		}
		else if(json.reason==="move"){
			document.getElementById(json.data.square).appendChild(document.getElementById(json.data.checker));
			var color = "Mustade";
			if(json.data.turn%2===1){
				color="Valgete"
			}
			$("#turnInfo").html(color+" käik");
			$(".forDeletion").removeClass("forDeletion");
			var forDeletion = json.data.markedForDeletion;
			for (var del in forDeletion) {
				document.getElementById(forDeletion[del]).classList.add("forDeletion");
			}
			$(".movable").removeClass("movable");
			var movable = json.data.movableCheckers;
			for (var ckr in movable) {
				if(movable[ckr].startsWith(myColor)) {
					document.getElementById(movable[ckr]).classList.add("movable");
				}
			}

			var kings = json.data.kings;
			for (var ckr in kings) {
				document.getElementById(kings[ckr]).classList.add("king");
			}
		}
		else if(json.reason === "validMoves"){
			var validSquares = json.data.moves;
			for (var square in validSquares) {
				document.getElementById(validSquares[square]).classList.add("mark");
			}
		}
		else if(json.reason === "gameOver"){
			$('#winnerLabel').html(json.data.winner==="black"?"MUST":"VALGE");
			$('#gameOverModal').modal('show');
			$('.pyro').removeClass("hidden");
		}
	};

	$("#newGameBtn").on("click",function () {
		connection.send(JSON.stringify({reason:"startNewGame",data:{}}));
	})

	$("#joinGameBtn").on("click",function () {
		var gameId=$("#gameIdInput").val();
		connection.send(JSON.stringify({reason:"joinGame",data:{gameId:gameId}}));
	})
});

