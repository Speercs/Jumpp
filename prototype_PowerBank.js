'use strict';

StructurePowerBank.prototype.nearbyPositions = function() {
  let openSpots = [];
  for (let x = this.pos.x - 1; x < this.pos.x + 2; x++) {
    for (let y = this.pos.y - 1; y < this.pos.y + 2; y++) {
      let pos = this.room.getPositionAt(x, y);
      
      if (pos.open) {
        openSpots.push(pos);
      }
    }
  }
  
  return openSpots;
}

StructurePowerBank.prototype.getMaxAttackers = function() {
  let results = this.room.lookAtArea(this.pos.y - 1,
    this.pos.x - 1,
    this.pos.y + 1,
    this.pos.x + 1,
    /* asArray= */
    true);

  return _.filter(results, t => ['plain', 'swamp'].includes(t.terrain)).length;
}

const MAX_FIGHTER_DISTANCE = 325;

StructurePowerBank.prototype.getBasesInRange = function() {
  let eligibleBases = _.filter(
      Game.terminalBases,
      r => r.spawns.length == 3 && r.controller.level == 8 && !r.memory.noPowerFarming && r.baseType != 'lw');
  let sources = [];

  for (let i=0; i < eligibleBases.length; i++) {
    let room = eligibleBases[i];

    let goals = _.map(room.spawns, function(s) {return {pos:s.pos, range:1};})
    
    let path = PathFinder.search(
        this.pos,
        goals,
        {
            maxCost: MAX_FIGHTER_DISTANCE,
            maxOps: 20000,
            range:1
        });
    
    if (!path.incomplete && path.cost < MAX_FIGHTER_DISTANCE) {
      sources.push({roomName:room.name, pathCost:path.cost});
    }
  }
  
  return sources;
}