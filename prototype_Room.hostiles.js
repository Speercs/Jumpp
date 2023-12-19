'use strict';

let hostiles = {};

function doHostileTowers(room) {
  if (!room.hostile) {
    return;
  }

  if (!room.myCreeps || !room.myCreeps.length) {
    return;
  }

  let hostileTowers = _.filter(room.towers, t => t.hostile && t.active && (t.store.energy >= 10));
  if (!hostileTowers.length || !room.myCreeps.length) {
    return;
  }

  if (room.controller &&
    room.controller.owner &&
    room.controller.owner.username == 'Saruss') {
    doHostileTowersSaruss(room, hostileTowers);
    return;
  }

  if (room.invaderCore && room.invaderCore.level) {
    doHostileTowersInvaders(room);
    return;
  }

  // Default towers. Assume all towers are going to fire at whatever target they, working with
  // the available fighting creeps, can hurt the most.

  _(room.myCreeps).forEach(c => c.maxRawDamage += c.pos.towerDamage).value();

  let likelyTarget = _.max(room.myCreeps, c => c.hitsMax - c.hits + c.maxDamage);
  likelyTarget.likelyRawDamage += likelyTarget.pos.towerDamage;
}

function doHostileTowersSaruss(room, hostileTowers) {
  // Figure that each tower will shoot at its nearest healer.
  // In practice, towers will seldom fire at all, whatever the circumstances.
  let targetSet = _.filter(room.myCreeps, 'healPower');

  if (!targetSet.length) {
    targetSet = room.myCreeps;
  }

  function distToNearestTower(target) {
    return target.pos.getRangeTo(target.pos.findClosestByRange(hostileTowers));
  }

  let likelyTarget = _.min(targetSet, t => distToNearestTower(t));

  _.forEach(hostileTowers, t => likelyTarget.likelyRawDamage += t.attackDamage(likelyTarget));
}

function doHostileTowersInvaders(room) {
  // TODO: We can know exactly who these will shoot. Get it right.
  _(room.myCreeps).forEach(c => c.maxRawDamage += c.pos.towerDamage).value();

  let likelyTarget = _.max(room.myCreeps, c => c.hitsMax - c.hits + c.maxDamage);
  likelyTarget.likelyRawDamage += likelyTarget.pos.towerDamage;
}

Room.prototype._checkHostilesCache = function() {
  if (!hostiles[this.name] ||
    hostiles[this.name].timestamp != Game.time) {

    // Init immediately, to prevent recursion.
    // TODO: Probably not necessary anymore.
    hostiles[this.name] = {timestamp: Game.time};

    let foreignCreeps = this.find(FIND_HOSTILE_CREEPS);

    let hostileCreeps = _.filter(foreignCreeps, 'hostile' );
      
    let npcs = _.filter(hostileCreeps, 'npc');
    let invaders = _.filter(npcs, c => c.owner.username == 'Invader');
    let hostilePlayerCreeps = _.filter(hostileCreeps, c => !c.npc);
    let friendlyPlayerCreeps = _.filter(
        foreignCreeps, c => !c.npc && isFriendly(c.owner.username));

    for (let i=0; i < hostileCreeps.length; i++) {
      hostileCreeps[i].likelyHeal = 0;
      hostileCreeps[i].maxHeal = 0;
      hostileCreeps[i].incomingDamage = 0;
    }

    for (let i=0; i < hostileCreeps.length; i++) {
      let creep = hostileCreeps[i];
      if (creep.healPower) {
        let nearbyCreeps = creep.pos.findInRange(hostileCreeps, 3);
        let touchRangeCreeps = creep.pos.findInRange(hostileCreeps, 1);
        for (let j=0; j < nearbyCreeps.length; j++) {
          let friend = nearbyCreeps[j];
          
          if (creep.pos.isNearTo(friend)) {
            friend.maxHeal += creep.healPower;
          } else {
            friend.maxHeal += creep.healPower / 3;
          }
        }
        
        for (let i=0; i < touchRangeCreeps.length; i++) {
          touchRangeCreeps[i].likelyHeal += creep.healPower / touchRangeCreeps.length;
        }
      }

      if (creep.attackPower) {
        let nearbyCreeps = creep.pos.findInRange(this.myCreeps, 1);
        for (let j=0; j < nearbyCreeps.length; j++) {
          nearbyCreeps[j].likelyRawDamage += creep.attackPower / nearbyCreeps.length;
          nearbyCreeps[j].maxRawDamage += creep.attackPower;
        }
      }

      if (creep.shootPower) {
        let nearbyCreeps = creep.pos.findInRange(this.myCreeps, 3);
        for (let j=0; j < nearbyCreeps.length; j++) {
          nearbyCreeps[j].likelyRawDamage += creep.shootPower / nearbyCreeps.length;
          nearbyCreeps[j].maxRawDamage += creep.shootPower;
        }
      }
    }

    // Very important to do creep projections first. Tower code assumes it's been done.
    try {
      doHostileTowers(this);
    } catch (err) {
      this.logError(`doHostileTowersError: ${err}`);
    }

    hostiles[this.name] = {
        foreignCreeps: foreignCreeps,
        hostileCreeps: hostileCreeps,
        npcs: npcs,
        invaders: invaders,
        hostilePlayerCreeps: hostilePlayerCreeps,
        friendlyPlayerCreeps: friendlyPlayerCreeps,
        timestamp: Game.time
    };
  }
}


Object.defineProperty(Room.prototype, 'alertCondition', {
  get: function() {
    return this.memory._alertCondition || ALERT_CONDITION_GREEN;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'hostileCreeps', {
  get: function() {
    this._checkHostilesCache();
    return this._hostileCreeps = hostiles[this.name].hostileCreeps;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'foreignCreeps', {
  get: function() {
    this._checkHostilesCache();
    return this._foreignCreeps = hostiles[this.name].foreignCreeps;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'npcs', {
  get: function() {
    this._checkHostilesCache();
    return this._foreignCreeps = hostiles[this.name].npcs;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'invaders', {
  get: function() {
    this._checkHostilesCache();
    return this._invaders = hostiles[this.name].invaders;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'hostilePlayerCreeps', {
  get: function() {
    this._checkHostilesCache();
    return this._foreignCreeps = hostiles[this.name].hostilePlayerCreeps;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'friendlyPlayerCreeps', {
  get: function() {
    this._checkHostilesCache();
    return this._foreignCreeps = hostiles[this.name].friendlyPlayerCreeps;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
