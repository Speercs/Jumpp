'use strict';

let Crew = require('units_crew_crew');


let crewNameDigits = Game.time;

function getUniqueCrewName(root) {
  do {
    let newName = root + (crewNameDigits++ % 100);
    if (!Memory.crews[newName]) {
      return newName;
    }
  } while (true);
}

function parseOptions(mem, options) {
  for (let key in options) {
    switch (key) {
      case 'debug':
        mem.debug = options.debug;
        break;
      case 'spawnTime':
        mem.spawnTime = options.spawnTime;
        break;
      case 'wait':
        if (typeof(options.wait) != 'number') {
          console.log(`Error: Wait value must be a number.`);
          return ERR_INVALID_ARGS;
        }
        mem.spawnTime = Game.time + options.wait;
        break;
      default:
        console.log(`Error: Invalid option ${key}.`);
        return ERR_INVALID_ARGS;
    }
  }

  return OK;
}

global.launchCrew = function(sourceRoom, targetRoom, options) {
  let id = getUniqueCrewName('crew');

  if (typeof sourceRoom != 'string' ||
    !Game.rooms[sourceRoom] ||
    !Game.rooms[sourceRoom].controller ||
    !Game.rooms[sourceRoom].controller.my ||
    Game.rooms[sourceRoom].energyCapacityAvailable < 1200) {
    return `Error: invalid source room`;
  }

  if (typeof targetRoom != 'string') {
    return `Error: invalid target room`;
  }

  let mem = {
    id: id,
    sourceRoom: sourceRoom,
    targetRoom: targetRoom,
    state: Crew.State.COUNTDOWN,
    subState: 0,
    creeps: []
  };

  let parseResult = parseOptions(mem, options);

  if (parseResult) {
    return parseResult;
  }

  Memory.crews[id] = mem;

  return `${id} queued.`;
}

global.crewReport = function() {
  console.log("name      state      source  target  TTL\n");
  console.log("-----     -----      ------  ------  ---\n");

  for (let crewName in Memory.crews) {
    let mem = Memory.crews[crewName];
    let state = (mem.state == Crew.State.COUNTDOWN) ? `t-${mem.spawnTime - Game.time}` : mem.state;
    let unit = Game.units[crewName];
    let ttl = _.min(unit.elements, 'ticksToLive').ticksToLive;
    console.log(_.padRight(`${crewName}`, 10) +
      _.padRight(`${state}`, 11) +
      roomNameLink(mem.sourceRoom) +
      _.padRight(``, 8 - mem.sourceRoom.length) + 
      roomNameLink(mem.targetRoom) +
      _.padRight(``, 8 - mem.targetRoom.length) + 
      _.padRight(`${ttl}`, 5));
  }

  return `${_.keys(Memory.crews).length} crews`;
}