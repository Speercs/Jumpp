'use strict';

let Varzs = require('util_varzs');


function isHostileAttack(entry) {
  if (entry.event != EVENT_ATTACK) {
      return false;
  }

  let target = Game.getObjectById(entry.data.targetId);
  let actor = Game.getObjectById(entry.objectId);

  if (!target || !actor) {
      return false;
  }

  if (target.npc || actor.npc) {
      return false;
  }

  if (target.hostile || actor.hostile) {
      return true;
  }

  return false;
}

Object.defineProperty(Room.prototype, 'groupedEvents', {
  get: function() {
    if (this._groupedEvents) {
      return this._groupedEvents;
    }

    let t0 = Game.cpu.getUsed();
    this._groupedEvents = _.groupBy(this.getEventLog(), 'event');
    let t1 = Game.cpu.getUsed();
    Varzs.logGroupEvents(t1-t0);
    return this._groupedEvents;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'destroyedStructureEvents', {
  get: function() {
    if (this._structuresDestroyed) {
      return this._structuresDestroyed;
    }

    return this._structuresDestroyed =
        _.filter(this.groupedEvents[EVENT_OBJECT_DESTROYED], e => e.data.type != 'creep');
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'hostileAttackEvents', {
  get: function() {
    if (this._hostileAttacks) {
      return this._hostileAttacks;
    }

    return this._hostileAttacks =
        _.filter(this.groupedEvents[EVENT_ATTACK], e => isHostileAttack(e));
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'harassEvents', {
  get: function() {
    if (this._harassEvents) {
      return this._harassEvents;
    }

    return this._harassEvents =
        _.filter(this.hostileAttackEvents, function (e) {
          let target = Game.getObjectById(e.data.targetId);
          return target &&
              target.memory &&
              ['digger', 'longhauler', 'builder', 'claimer'].includes(target.memory.role);
        });
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
                                                