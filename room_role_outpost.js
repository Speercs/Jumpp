'use strict';

let Autobuild = require('room_components_autobuild');
let Fight = require('room_components_fight');
let Nav = require('util_nav');
let Observe = require('util_observe');

function clearStructures(room) {
  if (!room.hashTime(5)) {
    return;
  }

  _(room.extensions)
    .filter(s => !s.my && !s.energy)
    .forEach(s => s.destroy())
    .value();

  _(room.links)
    .filter(s => !s.my && !s.energy)
    .forEach(s => s.destroy())
    .value();

  _(room.towers)
    .filter(s => !s.my && !s.energy)
    .forEach(s => s.destroy())
    .value();

  _(room.spawns)
    .filter(s => !s.my)
    .forEach(s => s.destroy())
    .value();

  _(room.labs)
    .filter(s => !s.my && !s.energy && !s.mineralAmount)
    .forEach(s => s.destroy())
    .value();

  if (room.storage && !room.storage.my && !_.sum(room.storage.store)) {
    room.storage.destroy();
  }

  if (room.terminal && !room.terminal.my && !_.sum(room.terminal.store)) {
    room.terminal.destroy();
  }
}

function findSourceWorkPosition(source) {
  let room = source.room;
  let spawnPos = room.spawn && room.spawn.pos;

  if (!spawnPos && room.constructionSites.length) {
    let spawnSites = _.find(
        source.room.constructionSites,
        {filter: s => s.structureType == STRUCTURE_SPAWN}
    );

    spawnPos = spawnSites && spawnSites[0] && spawnSites[0].pos;
  }

  if (!spawnPos) {
    spawnPos = Nav.findCentermostOpenSquare(room.name, 1);
  }

  let path = PathFinder.search(source.pos, {pos: spawnPos, range:1}).path;

  let x = path[0].x;
  let y = path[0].y;

  return {x,y};
}

function initDigsites(room) {
  let sources = room.find(FIND_SOURCES);
  if (!sources.length) {
    return;
  }

  room.memory.digsites = {};

  for (let i=0; i < sources.length; i++) {
    let source = sources[i];

    let diggerPosition = findSourceWorkPosition(source);
    room.memory.digsites[source.id] = {diggerPosition};
  }
}

function updateDigsites(room) {
  if (!room.memory.digsites) {
    initDigsites(room);
  }
}

function run(room) {
  Observe.setNextScan(room.name, 10);

  if (!room.controller || !room.controller.my) {
    return;
  }

  updateDigsites(room);
  
  Fight.update(room);

  Autobuild.update(room);

  clearStructures(room);
}

module.exports = {
  run
};