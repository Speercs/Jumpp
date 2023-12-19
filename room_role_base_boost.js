'use strict';

function drawCircleAt(roomPos, color) {
  new RoomVisual(roomPos.roomName).circle(roomPos.x, roomPos.y, {radius: 0.3, fill: color});
}

function drawSquareAt(roomPos, color) {
  new RoomVisual(roomPos.roomName).rect(roomPos.x-0.5, roomPos.y-0.5, 1, 1, {fill: color});
}

function drawTextAt(roomPos, text) {
  new RoomVisual(roomPos.roomName).text(text, roomPos.x, roomPos.y + 0.25, {color:'yellow'});

}

function drawBoostStuff(room) {
  if (!Memory.drawBoostStuff && !room.memory.drawBoostStuff) {
    return;
  }

  if (room.boostLab) {
    drawCircleAt(room.boostLab.pos, 'blue');
  }

  if (room.boostPos) {
    for (let i = 0; i < room.boostPos.length; i++) {
      drawSquareAt(room.boostPos[i], 'green');
      drawTextAt(room.boostPos[i], `${i}`);
    }
  }

  if (room.boostloaderPos) {
    for (let i = 0; i < room.boostloaderPos.length; i++) {
      drawSquareAt(room.boostloaderPos[i], 'cyan');
    }
  }
}

module.exports = {
  drawBoostStuff,
}