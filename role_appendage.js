'use strict';

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'appendage',
      model: model,
      state: STATE_APPENDAGE
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Appendage');
}

function requestSpawnUnit(rooms, model, unit, priority, options) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.unit = unit;

  _.merge(opts,memory, options.memory);

  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}


/** @param {Creep} creep **/
function run(creep) {
  switch (creep.memory.state) {
    case STATE_APPENDAGE:
      break;
    case STATE_DIE:
      creep.doDie();
      break;
    default:
      break;
  }
}

module.exports = {
  requestSpawnUnit,
  run,
};