'use strict';


const LISTEN_PERIOD = 11;
const SEND_PERIOD = 7;
const BROADCAST_USERNAME = 'Aundine';
const BROADCAST_SEGMENT = 87;

const ELIGIBLE_SENDER_MINIMUM_ENERGY = 10000;


function orderResourceTransfer(resourceType, amount, from, to) {
  console.log(`Received order for ${amount} ${resourceType} from ${from} to ${to}`);

  if (!_.isFinite(amount) ||
      amount < 1 ||
      typeof(resourceType) != 'string' ||
      typeof(to) != 'string' ||
      !to.isValidRoomName() ||
      (from && typeof(from) != 'string')) {
    console.log(`Rejecting bad order: Send ${amount} ${resourceType} from ${from} to ${to} (1)`);
    return ERR_INVALID_ARGS;
  }

  if (from) {
    let room = Game.rooms[from];

    if (!room || !room.isMyBase || !room.terminal || !room.terminal.active) {
      console.log(`Rejecting bad order: Send ${amount} ${resourceType} from ${from} to ${to} (2)`);
      return ERR_INVALID_ARGS;
    }
  }

  amount = _.round(amount);

  if (!Memory._shipOrders) {
    Memory._shipOrders = [];
  }

  Memory._shipOrders.push({resourceType, amount, from, to});
}

function serviceOrder(order) {
  let possibleSenders = _.filter(
      Game.terminalBases,
      b => !b.terminal.busy &&
          b.name == (order.from || b.name) &&
          !b.terminal.cooldown &&
          b.terminal.store[order.resourceType] > 0 &&
          b.terminal.store[RESOURCE_ENERGY] >= ELIGIBLE_SENDER_MINIMUM_ENERGY);

  console.log(`${possibleSenders.length} possible senders`);

  if (!possibleSenders.length) return;

  let nearestSender = _.min(possibleSenders, r => Game.map.getRoomLinearDistance(r.name, order.to, true));

  if (!nearestSender) {
    throw `Very odd error: There are senders, but none is closest?`;
  }

  let cost1k = Game.market.calcTransactionCost(1000, nearestSender.name, order.to);
  if (order.resourceType == RESOURCE_ENERGY) cost1k += 1000;
  let amountWeCanAffordToSend = Math.floor(nearestSender.terminal.store.energy * 1000 / cost1k);

  let amountToSend = Math.min(
      order.amount,
      amountWeCanAffordToSend,
      nearestSender.terminal.store[order.resourceType]);

  console.log(`Nearest sender is ${nearestSender.name}. It has ` + 
      `${nearestSender.terminal.store[order.resourceType]} and ` + 
      `${nearestSender.terminal.store.energy} energy, can afford to send ${amountWeCanAffordToSend}, and will send ${amountToSend}`);

  let result = nearestSender.terminal.mySend(
      order.resourceType,
      amountToSend,
      order.to,
      'shipOrder');

  if (result != OK) {
    nearestSender.logError(`Unexpected failure to send ${order.amount} ${order.resourceType} to ` +
        `${order.to} via sendOrder.`);
    return;
  }

  nearestSender.logError(`Successfully sent ${order.amount} ${order.resourceType} to ` +
      `${order.to} via sendOrder.`);
  order.amount -= amountToSend;
}

function attemptTransfers() {
  if (Game.time % SEND_PERIOD) return;
  if (!Memory._shipOrders || !Memory._shipOrders.length) return;

  for (let order of Memory._shipOrders) {
    console.log(`Considering order to send ${order.amount} ${order.resourceType} from ${order.from} to ${order.to}`);
    serviceOrder(order);
  }

  Memory._shipOrders = _.filter(Memory._shipOrders, o => o.amount > 0);
}

function update() {
  try {
    updateImpl();
  } catch (err) {
    console.log(`receive.update error: ${err}`);
  }
}

function updateImpl() {
  RawMemory.setActiveForeignSegment(BROADCAST_USERNAME, BROADCAST_SEGMENT);

  attemptTransfers();

  if (Game.time % LISTEN_PERIOD) return;

  if (!RawMemory.foreignSegment ||
      !RawMemory.foreignSegment.data) {
    return;
  }

  let requests = JSON.parse(RawMemory.foreignSegment.data).requests;

  if (!requests || !requests.length) return;

  let newRequests = _.filter(requests, r => !(r.timestamp <= Memory._lastReceivedBroadcast));

  if (!newRequests.length) return;

  Memory._lastReceivedBroadcast = Game.time;

  for (let r of newRequests) {
    orderResourceTransfer(r.resourceType, r.amount, r.sourceRoom, r.roomName);
  }

  return;
}

module.exports = {
  update,
}
