'use strict';

function allSpawnsWithinTwo(target) {
  return _.all(target.room.spawns, s => s.pos.inRangeTo(target.pos, 2));
}

function storageWithinTwo(target) {
  return target.room.memory.role == 'base' &&
      target.room.mainStore &&
      target.room.mainStore.pos.inRangeTo(target, 2);
}

function controllerWithinFour(target) {
  return target.room.controller && target.room.controller.pos.inRangeTo(target, 4);
}

let linksCache = {};

function updateCache(room) {
  room._linkCacheCheck = true;
  let key = room.links.length + room.spawns.length * 10 + (room.storage ? 100 : 0);

  if (linksCache[room.name] && linksCache[room.name].key == key) {
    return;
  }

  let activeLinks = _.filter(room.links, 'active');

  let storageLink = _.find(activeLinks, storageWithinTwo);

  let spawnLink;
  if (room.baseType == 'tigga') {
    spawnLink = _.find(activeLinks, allSpawnsWithinTwo);
  }

  let remainingLinks = _.difference(activeLinks, [storageLink, spawnLink]);

  let upgradeLinkCandidates = _.filter(remainingLinks, controllerWithinFour);
  let upgradeLink = room.controller && room.controller.pos.findClosestByRange(upgradeLinkCandidates);

  let sources = room.find(FIND_SOURCES);
  let digsiteLinks = _.filter(remainingLinks, l => _.any(sources, s => l.pos.inRangeTo(s, 2)));

  let dropLinks = _.difference(remainingLinks, _.union(digsiteLinks, [upgradeLink]));

  linksCache[room.name] = {
      key: key,
      storageLink: storageLink && storageLink.id,
      spawnLink: spawnLink && spawnLink.id,
      upgradeLink: upgradeLink && upgradeLink.id,
      digsiteLinks: _.map(digsiteLinks, 'id'),
      dropLinks: _.map(dropLinks, 'id')
  };
}

function getDigsiteLinkIds(room) {
  room._linkCacheCheck || updateCache(room);
  return linksCache[room.name].digsiteLinks;
}

function getDropLinkIds(room) {
  room._linkCacheCheck || updateCache(room);
  return linksCache[room.name].dropLinks;
}

function getLinkId(room, key) {
  room._linkCacheCheck || updateCache(room);
  return linksCache[room.name][key];
}

function registerTransfer(linkId) {
  if (!Game._linksReceivingTransfers) {
    Game._linksReceivingTransfers = [];
  }

  Game._linksReceivingTransfers.push(linkId);
}

function executeTransfers() {
  for (let i in Game._linksReceivingTransfers) {
    let link = Game.getObjectById(Game._linksReceivingTransfers[i]);
    link.executeTransfers();
  }
}

module.exports = {
  executeTransfers,
  getDigsiteLinkIds,
  getDropLinkIds,
  getLinkId,
  registerTransfer,
}
