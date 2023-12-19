'use strict';

const State = {
  INIT: "init",
  WAIT: "wait",
  CLEANUP: "cleanup",
  DONE: "done",
};


function update(room) {
  if (!room.memory.serveController) {
    return;
  }

  function setState(state) {
    room.memory.serveController.state = state;
  }

  function doInit() {
    room.logError(`serveController: Initialzing`);
    setState(State.WAIT);
  }

  function doWait() {
    if (room.controller.level == 8) {
      room.logError(`serveController: Cleaning up`);
      setState(State.CLEANUP);
    }
  }

  function doCleanup() {
    let servingLab = _.find(room.labs, 'servingController');

    if (servingLab && !servingLab.energy && !servingLab.mineralAmount) {
      room.logError(`serveController: Deleting the lab at ${servingLab.pos.link}`);
      servingLab.destroy();
      return;
    }

    if (servingLab) {
      return;
    }

    if (!room.terminal || !room.terminal.servingController) {
      room.logError(`serveController: Done`);
      setState(State.DONE);
      return;
    }

    if (_.sum(room.terminal.store) == room.terminal.store.energy &&
      room.terminal.store.energy < 2000) {
      room.logError(`Terminal is passably empty. Deleting.`);
      room.terminal.destroy();
      room.invalidateStructuresCache();
      return;
    }

    if (room.terminal.cooldown) {
      return;
    }

    let thingOtherThanEnergy =
      _.find(_.keys(room.terminal.store), key => key != RESOURCE_ENERGY);

    if (thingOtherThanEnergy) {
      room.terminal.mySend(
        thingOtherThanEnergy,
        room.terminal.store[thingOtherThanEnergy],
        room.nearestTerminalBase.name);
      return;
    }

    let costToSendOneK = Game.market.calcTransactionCost(1000, room.name, room.nearestTerminalBase.name);
    let maxToSend = Math.floor(room.terminal.store.energy / (costToSendOneK + 1000)) * 1000;
    room.logError(`I think I can send ${maxToSend}`);

    room.terminal.mySend(
      RESOURCE_ENERGY,
      maxToSend,
      room.nearestTerminalBase.name);
  }

  switch (room.memory.serveController.state) {
    case State.INIT:
      doInit();
      break;
    case State.WAIT:
      doWait();
      break;
    case State.CLEANUP:
      doCleanup();
      break;
    case State.DONE:
      delete room.memory.serveController;
      return;
    default:
      setState(State.INIT);
      return;
  }
}

module.exports = {
  update
}
