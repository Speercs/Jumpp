'use strict';

let Claimer = require('role_claimer');
let SpawnJob = require('util_spawnJob');

let claimCache = {};

function checkClaimCache() {
  if (claimCache.updateTime == Game.time) {
    return;
  }

  claimCache.updateTime = Game.time;

  if (!Memory.outposts) {
    console.log('Initializing Memory.outposts to empty.');
    Memory.outposts = [];
  }

  let unclaimedOutposts = _.filter(
      Memory.outposts,
      rn => !Game.rooms[rn] || !Game.rooms[rn].controller.level);

  let claimersForOutposts = _.filter(
      Game.claimers,
      c => Memory.outposts && Memory.outposts.includes(c.memory.workRoom));

  let outpostsWithClaimers = _.map(claimersForOutposts, 'memory.workRoom');

  let outpostsNeedingClaimers = _.difference(unclaimedOutposts, outpostsWithClaimers);

  claimCache.outpostsNeedingClaimers = outpostsNeedingClaimers;

  for (let index in outpostsNeedingClaimers) {
    let roomName = outpostsNeedingClaimers[index];
    let basesPossiblyInRange =
        _.filter(Game.bases, b => b.energyCapacityAvailable >= 650 && Game.map.getRoomLinearDistance(roomName, b.name) < 12);

    let basesInRange = _(basesPossiblyInRange)
        .filter(b => Game.map.findRoute(roomName, b).length < 14)
        .map('name')
        .value();

    let nearest = _.min(basesInRange, b => Game.map.findRoute(roomName, b).length);

    //console.log(`nearest base in range of ${roomName} is ${nearest}`);

    Claimer.requestSpawn([nearest], 1, null, SpawnJob.PRIORITY_HIGH, roomName);
  }
}

function update(room) {
  try {
    checkClaimCache();
  } catch (err) {
    room.logError(`Claim checkClaimCache error: ${err}`);
  }
}

module.exports = {
  update,
}
