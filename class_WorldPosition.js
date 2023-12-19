'use strict';

let Nav = require('util_nav');


class WorldPosition {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  static fromRoomPosition(pos) {
    let worldPos = worldPositionFromRoomPosition(pos);
    return new WorldPosition(worldPos.x, worldPos.y);
  }

  toRoomPosition() {
    return roomPositionFromWorldPosition(this);
  }

  isEqualTo(pos) {
    return this.x == pos.x && this.y == pos.y;
  }

  isNearTo(pos) {
    return Math.abs(this.x - pos.x) <= 1 && Math.abs(this.y - pos.y) <= 1;
  }

  oneStep(direction) {
    let x = this.x + [0,0,1,1,1,0,-1,-1,-1][direction];
    let y = this.y + [0,-1,-1,0,1,1,1,0,-1][direction];
  
    return new WorldPosition(x, y);
  }

  getCartesianDistance(target) {
    let pos = target.worldPos || target;

    if (!pos instanceof WorldPosition) {
      throw `target is not WorldPosition`;
    }
  
    let dx = this.x - pos.x;
    let dy = this.y - pos.y;
  
    return Math.sqrt(dx*dx + dy*dy);
  }
  
  getCartesianDistanceSquared(target) {
    let pos = target.worldPos || target;

    if (!pos instanceof WorldPosition) {
      throw `target is not WorldPosition`;
    }
  
    let dx = this.x - pos.x;
    let dy = this.y - pos.y;
  
    return dx*dx + dy*dy;
  }

  getLinearDistance(target) {
    let pos = target.worldPos || target;

    if (!pos instanceof WorldPosition) {
      throw `target is not WorldPosition`;
    }  
  
    return Math.max(Math.abs(this.x - pos.x), Math.abs(this.y - pos.y));
  }
  
}

function worldPositionFromRoomPosition(pos) {
  let xy = Nav.roomNameToXY(pos.roomName);
  let x = xy[0] * 49 + pos.x;
  let y = xy[1] * 49 + pos.y;
  return {x, y};
}

function roomPositionFromWorldPosition(pos) {
  let roomX = Math.floor(pos.x / 49);
  let roomY = Math.floor(pos.y / 49);
  let roomName = Nav.getRoomNameFromXY(roomX, roomY);


  let x = pos.x - roomX * 49;
  let y = pos.y - roomY * 49;

  return new RoomPosition(x, y, roomName);
}

global.WorldPosition = WorldPosition;