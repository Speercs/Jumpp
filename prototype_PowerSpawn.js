'use strict';

let Books = require('util_books');
let Varzs = require('util_varzs');


StructurePowerSpawn.prototype.__processPower = StructurePowerSpawn.prototype.processPower;

StructurePowerSpawn.prototype.processPower = function() {
  let result = this.__processPower();
  if (result == OK) {
    Books.logEnergy(this.room, 'power', POWER_SPAWN_ENERGY_RATIO);
    Books.logPower(this.room, 'processed', 1);
    Varzs.logPower(1);
  }

  return result;
}
