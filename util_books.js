'use strict';

const standardFields = {
  energy: {
    harvested: 0,
    unharvested: 0,
    pickedUp: 0,
    delivered: 0,
    upgrade: 0,
    spawn: 0,
    power: 0,
    tower: 0,
    diggerRepair: 0,
    diggerBuild: 0,
    builderIn: 0,
    builderOut: 0,
    linkLoss: 0,
    terminalLoss: 0,
    sent: 0,
    received: 0
  },

  power: {
    pickedUp: 0,
    delivered: 0,
    processed: 0,
    sent: 0,
    received: 0
  }
};

function init() {
  if (!Memory.books) {
    Memory.books = {enable: false, energy: {}, power: {}, archive: []};
  }

  if (!Memory.books.enable) {
    return;
  }
  
  if (Game.time % 10000 == 0) {
    Memory.books.archive.unshift({
        energy: Memory.books.energy,
        power: Memory.books.power});
    Memory.books.archive = _.slice(Memory.books.archive, 0, 3);
    delete Memory.books.energy;
    delete Memory.books.power;
  }
  
  if (!Memory.books.energy) {
    takeInventory();
    Memory.books.energy = {
        startTime: Game.time,
        startingEnergy: Game.inventory.total.energy,
        currentEnergy: Game.inventory.total.energy,
    };
  }

  if (!Memory.books.power) {
    takeInventory();
    Memory.books.power = {
        startTime: Game.time,
        startingPower: Game.inventory.total.power,
        currentPower: Game.inventory.total.power,
    }
  }
  
  if (Game.time & 1000 == 999) {
    takeInventory();
    Memory.books.energy.currentEnergy = Game.inventory.total.energy;
    Memory.books.energy.netChange =
        Memory.books.energy.currentEnergy - Memory.books.energy.startingEnergy;
    Memory.books.power.currentPower = Game.inventory.total.power,
    Memory.books.power.netChange =
        Memory.books.power.currentPower - Memory.books.power.startingPower;
  }
}

function logEnergy(source, label, amount) {
  if (!Memory.books || !Memory.books.enable) {
    return;
  }
  
  let roomName = (source.pos && source.pos.roomName) ||
      // room?
      (source.name && Game.rooms[source.name].name) ||
      // roomName?
      (Game.rooms[source] && Game.rooms[source].name) ||
      // roomName (lacking visibility)?
      (Memory.rooms[source] && source);

  if (!Memory.rooms[roomName]) {
    return ERR_INVALID_ARGS;
  }

  let baseName =
      (Memory.rooms[roomName].role == 'base' && roomName) || Memory.rooms[roomName].base;
  if (!roomName || !baseName || !label || (amount == undefined)) {
    return ERR_INVALID_ARGS;
  }

  if (!Memory.books.energy.total) {
    Memory.books.energy.total = _.clone(standardFields.energy);
  }

  if (!Memory.books.energy.byRoom) {
    Memory.books.energy.byRoom = {};
  }

  if (!Memory.books.energy.byBase) {
    Memory.books.energy.byBase = {};
  }

  if (!Memory.books.energy.byRoom[roomName]) {
    Memory.books.energy.byRoom[roomName] = _.clone(standardFields.energy);
  }

  if (!Memory.books.energy.byBase[baseName]) {
    Memory.books.energy.byBase[baseName] = _.clone(standardFields.energy);
  }

  Memory.books.energy.total[label] =
      (Memory.books.energy.total[label] || 0) + amount;
  Memory.books.energy.byRoom[roomName][label] =
      (Memory.books.energy.byRoom[roomName][label] || 0) + amount;
  Memory.books.energy.byBase[baseName][label] =
      (Memory.books.energy.byBase[baseName][label] || 0) + amount;
}

function logPower(source, label, amount) {
  if (!Memory.books || !Memory.books.enable) {
    return;
  }
  
  let roomName = (source.pos && source.pos.roomName) ||
      // room?
      (source.name && Game.rooms[source.name].name) ||
      // roomName?
      (Game.rooms[source] && Game.rooms[source].name) ||
      // roomName (lacking visibility)?
      (Memory.rooms[source] && source);

  if (!Memory.rooms[roomName]) {
    return ERR_INVALID_ARGS;
  }

  let baseName = (Memory.rooms[roomName].role == 'base' && roomName) ||
      Memory.rooms[roomName].base ||
      (Memory.rooms[roomName].powerBanks &&
          _.sample(Memory.rooms[roomName].powerBanks).deliveryRoom);
  if (!roomName || !baseName || !label || (amount == undefined)) {
    return ERR_INVALID_ARGS;
  }

  if (!Memory.books.power.total) {
    Memory.books.power.total = _.clone(standardFields.power);
  }

  if (!Memory.books.power.byRoom) {
    Memory.books.power.byRoom = {};
  }

  if (!Memory.books.power.byBase) {
    Memory.books.power.byBase = {};
  }

  if (!Memory.books.power.byRoom[roomName]) {
    Memory.books.power.byRoom[roomName] = _.clone(standardFields.power);
  }

  if (!Memory.books.power.byBase[baseName]) {
    Memory.books.power.byBase[baseName] = _.clone(standardFields.power);
  }

  Memory.books.power.total[label] = (Memory.books.power.total[label] || 0) + amount;
  Memory.books.power.byRoom[roomName][label] = (Memory.books.power.byRoom[roomName][label] || 0) + amount;
  Memory.books.power.byBase[baseName][label] = (Memory.books.power.byBase[baseName][label] || 0) + amount;
}

module.exports = {
  init,
  logEnergy,
  logPower,
};
