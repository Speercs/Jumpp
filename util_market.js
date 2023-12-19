'use strict';

let Books = require('util_books');
let Nav = require('util_nav');

function setOrders() {
  Game.orders = {};
  Game.orders.all = Game.market.getAllOrders();
  Game.orders.energyBuy = _.filter(
      Game.orders.all,
      o => o.type == ORDER_BUY &&
          o.resourceType == RESOURCE_ENERGY &&
          o.price >= LOW_ENERGY_PRICE &&
          o.amount >= 1000);
}

const INTERESTING_RESOURCES = {
  [global.RESOURCE_ORGANISM]: {price: 3000000, reserve: 0},
  [global.RESOURCE_DEVICE]: {price: 3000000, reserve: 0},
}

function buyPower() {
  if (Game.time % 100 == 23) buyPowerFromSellOrders();
  if (Game.time % 20 == 7) updatePowerBuyOrders();
}

global.updatePowerBuyOrder = function() {
  return updatePowerBuyOrders();
}

function updatePowerBuyOrders() {
  for (let room of Game.vaults) {
    updatePowerBuyOrder(room);
  }
}

function updatePowerBuyOrder(room) {
  if (room.storage && room.storage.store[RESOURCE_POWER] > 400000) return;
  
  let myBuyOrders = _.filter(
    room.orders,
    o => o.type == ORDER_BUY && o.resourceType == RESOURCE_POWER);

  if (myBuyOrders.length > 1) return;

  if (myBuyOrders.length && myBuyOrders[0].remainingAmount > 5000) return;

  room.logError(`I need to create or top up my power buy order. (len=${myBuyOrders.length})`);
  room.logError(`Order=${JSON.stringify(myBuyOrders[0])}`);

  if (myBuyOrders.length) {
    Game.market.extendOrder(myBuyOrders[0].id, 10000 - myBuyOrders[0].remainingAmount);
    return;
  }

  Game.market.createOrder(ORDER_BUY, RESOURCE_POWER, POWER_BUY_ORDER_PRICE, 10000, room.name);
}

function buyPowerFromSellOrders() {
  if (Game.market.credits < CREDITS_REQUIRED_FOR_BUYING_POWER) return;
  
  let reservePower = _.sum(Game.vaults, v => v.storage && v.storage.store[RESOURCE_POWER] || 0);
  if (reservePower > NPC_POWER_BUY_RESERVE_CUTOFF) return;

  if (!Game.orders || !Game.orders.all) {
    setOrders();
  }

  Game.orders.powerSell = _.filter(
      Game.orders.all,
      o => o.type == ORDER_SELL &&
      o.amount > 0 &&
      o.resourceType == RESOURCE_POWER &&
      (o.price <= PC_POWER_PRICE ||
          (o.price <= NPC_POWER_PRICE && o.roomName.isHighwayIntersection())));

  if (!Game.orders.powerSell.length) return;

  let allBuyers = _.filter(
      Game.terminalBases,
      b => b.activeTerminal &&
          !b.terminal.cooldown &&
          !b.terminal.busy &&
          b.terminal.store[RESOURCE_ENERGY] > 10000);

  for (let order of Game.orders.powerSell) {
    let buyers = _.filter(allBuyers, b => !b.terminal.busy);
    let nearest = _.min(buyers, b => Nav.getRoomDistanceManhattan(b.name, order.roomName));
    let amount = Math.min(order.amount, order.remainingAmount, 10000);
    let result = Game.market.deal(order.id, amount, nearest.name);
    if (result == OK) {
      nearest.terminal.busy = true;
      nearest.logError(`Buying ${amount} power for ${order.price} each.`);
    }
  }
}
     
function sellToNpcs() {
  let readyVaults = _.filter(
    Game.vaults,
    b => b.activeTerminal &&
       !b.activeTerminal.cooldown &&
       !b.activeTerminal.busy);

  if (!readyVaults.length) {
    return;
  }

  let vault = readyVaults[0];

  if (!Game.orders || !Game.orders.all) {
    setOrders();
  }

  let npcBuyOrders = _.filter(
      Game.orders.all,
      o => o.type == ORDER_BUY &&
          o.roomName &&
          //o.roomName.isHighwayIntersection() &&
          o.amount > 0 &&
          INTERESTING_RESOURCES[o.resourceType] &&
          o.price >= INTERESTING_RESOURCES[o.resourceType].price);

  let buyOrders = _.groupBy(npcBuyOrders, 'resourceType');

  function sell(resourceType, amountToKeep, minPrice) {
    let amountOnHand = vault.roughInventory(resourceType);
    let amountInTerminal = vault.terminal.store[resourceType];
    if ((amountOnHand <= amountToKeep) || !amountInTerminal) {
      return;
    }

    if (!buyOrders[resourceType]) {
      return;
    }

    let best = _.max(buyOrders[resourceType], 'price');
    if (!best || best.price < minPrice) {
      return;
    }

    let amountToSell = Math.min(amountOnHand - amountToKeep,
        amountInTerminal,
        best.remainingAmount);

    Game.market.deal(best.id, amountToSell, vault.name);
    vault.logDebug(`Selling ${amountToSell} ${resourceType} at ${best.price}`);
    vault.terminal.busy = true;
  }

  for (let key in INTERESTING_RESOURCES) {
    sell(key, INTERESTING_RESOURCES[key].reserve, INTERESTING_RESOURCES[key].price);
    if (vault.terminal.busy) return;
  }
}

function logPurchase(resourceType, amount, price) {
  if (!Memory.market) {
    Memory.market = {};
  }

  if (!Memory.market.purchasePrices) {
    Memory.market.purchasePrices = {};
  }

  Memory.market.purchasePrices[resourceType] = {price: price, time: Game.time};

  let cost = amount * price;
  if (!Memory.market.accumulator[ORDER_BUY][resourceType]) {
    Memory.market.accumulator[ORDER_BUY][resourceType] = {amount, cost};
  } else {
    Memory.market.accumulator[ORDER_BUY][resourceType].amount += amount;
    Memory.market.accumulator[ORDER_BUY][resourceType].cost += cost;
  }
}

function logSale(resourceType, amount, price, transactionCost) {
  let cost = amount * price;
  if (!Memory.market.accumulator[ORDER_SELL][resourceType]) {
    Memory.market.accumulator[ORDER_SELL][resourceType] = {amount, cost, transactionCost};
  } else {
    Memory.market.accumulator[ORDER_SELL][resourceType].amount += amount;
    Memory.market.accumulator[ORDER_SELL][resourceType].cost += cost;
    Memory.market.accumulator[ORDER_SELL][resourceType].transactionCost += transactionCost;
  }
}

function processBuys() {
  for (let i = 0;
      i < Game.market.incomingTransactions.length &&
          Game.market.incomingTransactions[i].time == Game.time - 1;
      i++ ) {
    let t = Game.market.incomingTransactions[i];
    if (t.sender &&
        t.sender.username != MY_USERNAME &&
        t.order &&
        t.order.type == ORDER_BUY) {
      //console.log(`util_market.processBuys: Bought ${t.amount} ${t.resourceType} at ${t.order.price} each.`);
      logPurchase(t.resourceType, t.amount, t.order.price);
    }
    if (t.recipient &&
        t.recipient.username == MY_USERNAME &&
        t.order &&
        t.order.type == ORDER_SELL ) {
      let shippingPerUnit = HIGH_ENERGY_PRICE * Game.market.calcTransactionCost(t.amount, t.from, t.to) / t.amount;
      //console.log(`util_market.processBuys(from sell order): Bought ${t.amount} ${t.resourceType} at ${t.order.price}(+${shippingPerUnit}) each.`);
      logPurchase(t.resourceType, t.amount, t.order.price + shippingPerUnit);
    }

    if (t.sender && t.sender.username == MY_USERNAME && t.resourceType == RESOURCE_POWER) {
      Books.logPower(t.from, 'sent', t.amount);
      Books.logPower(t.to, 'received', t.amount);
    }
  }
}

function processSales() {
  if (!Memory.market.accumulator) {
    Memory.market.accumulator = {
      [global.ORDER_BUY]: {},
      [global.ORDER_SELL]: {},
      realTime: Date.now(),
      time: Game.time
    };
  }
  
  // If I sold stuff last tick, book it.
  for (let i = 0;
      i < Game.market.outgoingTransactions.length &&
          Game.market.outgoingTransactions[i].time == Game.time - 1;
      i++ ) {
    let t = Game.market.outgoingTransactions[i];
    
    if (t.order && ((t.recipient && t.recipient.username) != MY_USERNAME)) {
      let transactionCost = Game.market.calcTransactionCost(t.amount, t.to, t.from);

      //console.log(`util_market.processSales: Sold ${t.amount} ${t.resourceType} at ${t.order.price} each.`);
      logSale(t.resourceType, t.amount, t.order.price, transactionCost);

      if (t.resourceType == RESOURCE_ENERGY) {
        Books.logEnergy(t.from, 'sales', t.amount + transactionCost);
      } else {
        Books.logEnergy(t.from, 'sales', transactionCost);
      }
    }
  }
}

global.energyBuyPrice = function(roomName, targetAmount) {
  if (!roomName) {
    roomName = 'E21N27';
  }

  if (!targetAmount) {
    targetAmount = 50000;
  }

  let orders = Game.market.getAllOrders(
    o => o.type == ORDER_SELL &&
       o.resourceType == RESOURCE_ENERGY &&
       o.price <= 0.1
  );

  if (!orders.length) return Infinity;
  
  for (let i=0; i < orders.length; i++) {
    let order = orders[i];
    let transactionCost = Game.market.calcTransactionCost(
      order.amount, order.roomName, roomName);
    let netEnergy = order.amount - transactionCost;
    let unitPrice = (order.amount * order.price) / netEnergy;
    order.netEnergy = netEnergy;
    order.unitPrice = unitPrice;
  }
  
  // sort by price, ascending
  orders.sort(function(a,b) {return a.unitPrice - b.unitPrice;});
  
  let totalAmount = 0;
  let totalCost = 0;
  let orderIndex = 0;
  do {
    let order = orders[orderIndex];
    let orderAmount = Math.min(order.amount, targetAmount - totalAmount);

    totalAmount += orderAmount;
    totalCost += orderAmount * order.unitPrice;
    
    orderIndex++;
    
  } while ((targetAmount > totalAmount) && (orderIndex < orders.length));
  
  if (totalAmount == targetAmount) {
    let unitPrice = totalCost / totalAmount;
    return unitPrice;
  } else {
    return -1;
  }
}

global.mineralBuyPrice = function(mineralType, targetAmount, roomName, energyPrice) {
  if (!mineralType || !RESOURCES_ALL.includes(mineralType)) {
    return ERR_INVALID_ARGS;
  }
  
  if (!roomName) {
    roomName = 'E21N27';
  }

  if (!targetAmount) {
    targetAmount = 50000;
  }
  
  if (!energyPrice) {
    energyPrice = energyBuyPrice(50000, roomName);
  }

  let orders = Game.market.getAllOrders(
    o => o.type == ORDER_SELL &&
       o.resourceType == mineralType
  );
  
  for (let i=0; i < orders.length; i++) {
    let order = orders[i];
    let transactionCost = Game.market.calcTransactionCost(
      order.amount, order.roomName, roomName);
    let orderTotalPrice = order.amount * order.price + transactionCost * energyPrice;
    order.unitPrice = orderTotalPrice / order.amount;
  }
  
  // sort by price, ascending
  orders.sort(function(a,b) {return a.unitPrice - b.unitPrice;});
  
  let totalAmount = 0;
  let totalCost = 0;
  let orderIndex = 0;
  do {
    let order = orders[orderIndex];
    let orderAmount = Math.min(order.amount, targetAmount - totalAmount);

    totalAmount += orderAmount;
    totalCost += orderAmount * order.unitPrice;
    
    orderIndex++;
    
  } while ((targetAmount > totalAmount) && (orderIndex < orders.length));
  
  if (totalAmount == targetAmount) {
    let unitPrice = totalCost / totalAmount;
    console.log(`${orders[0].id} ${orders[0].amount} ${orders[0].price}`);
    return unitPrice;
  } else {
    return -1;
  }
}

global.energySellPrice = function(roomName, targetAmount) {
  if (!roomName) {
    roomName = 'E21N27';
  }

  if (!targetAmount) {
    targetAmount = 50000;
  }

  let orders = Game.market.getAllOrders(
    o => o.type == ORDER_BUY &&
       o.resourceType == RESOURCE_ENERGY &&
       o.price >= 0.01
  );
  
  for (let i=0; i < orders.length; i++) {
    let order = orders[i];
    let transactionCost = Game.market.calcTransactionCost(
      order.amount, order.roomName, roomName);
    let netEnergy = order.amount + transactionCost;
    let unitPrice = (order.amount * order.price) / netEnergy;
    order.netEnergy = netEnergy;
    order.unitPrice = unitPrice;
  }
  
  // sort by price, descending
  orders.sort(function(a,b) {return b.unitPrice - a.unitPrice;});
  
  let totalAmount = 0;
  let totalCost = 0;
  let orderIndex = 0;
  do {
    let order = orders[orderIndex];
    let orderAmount = Math.min(order.amount, targetAmount - totalAmount);

    totalAmount += orderAmount;
    totalCost += orderAmount * order.unitPrice;
    
    orderIndex++;
    
  } while ((targetAmount > totalAmount) && (orderIndex < orders.length));
  
  if (totalAmount == targetAmount) {
    let unitPrice = totalCost / totalAmount;
    return unitPrice;
  } else {
    return -1;
  }
}

global.mineralSellPrice = function(mineralType, targetAmount, roomName, energyPrice) {
  if (!mineralType || !RESOURCES_ALL.includes(mineralType)) {
    return ERR_INVALID_ARGS;
  }
  
  if (!roomName) {
    roomName = 'E21N27';
  }

  if (!targetAmount) {
    targetAmount = 50000;
  }
  
  if (!energyPrice) {
    energyPrice = energyBuyPrice(50000, roomName);
  }

  let orders = Game.market.getAllOrders(
    o => o.type == ORDER_BUY &&
       o.resourceType == mineralType
  );
  
  for (let i=0; i < orders.length; i++) {
    let order = orders[i];
    let transactionCost = Game.market.calcTransactionCost(
      order.amount, order.roomName, roomName);
    let orderTotalPrice = order.amount * order.price - transactionCost * energyPrice;
    order.unitPrice = orderTotalPrice / order.amount;
  }
  
  // sort by price, descending
  orders.sort(function(a,b) {return b.unitPrice - a.unitPrice;});
  
  let totalAmount = 0;
  let totalCost = 0;
  let orderIndex = 0;
  do {
    let order = orders[orderIndex];
    let orderAmount = Math.min(order.amount, targetAmount - totalAmount);

    totalAmount += orderAmount;
    totalCost += orderAmount * order.unitPrice;
    
    orderIndex++;
    
  } while ((targetAmount > totalAmount) && (orderIndex < orders.length));
  
  if (totalAmount == targetAmount) {
    let unitPrice = totalCost / totalAmount;
    console.log(`${orders[0].id} ${orders[0].amount} ${orders[0].price}`);
    return unitPrice;
  } else {
    return -1;
  }
}

const DEFAULT_ENERGY_PRICE = 0.03;

/**
 * Sell minerals
 * @param mineralType
 * @param roomName
 * @param minPrice
 * @param energyPrice
 * @returns {number}
 */
global.sellMineral = function(mineralType, roomName, minPrice, energyPrice) {
  if (energyPrice == undefined) {
    energyPrice = DEFAULT_ENERGY_PRICE;
  }
  let bestOrder = bestMineralBuyOrder(mineralType, roomName, energyPrice);
  console.log('bestPrice = ' + bestOrder.unitPrice);
  let amount = Math.min(Game.rooms[roomName].terminal.store[mineralType], bestOrder.amount);

  if (bestOrder.unitPrice >= minPrice) {
    console.log('Selling to order ' + bestOrder.id + ' unitPrice = ' + bestOrder.unitPrice);
    let sellResult = Game.market.deal(bestOrder.id, amount, roomName);
    if (sellResult == OK) {
      let estTotalSale = _.round(amount * bestOrder.unitPrice,2);
      console.log(`Sold ${amount} ${mineralType} for ${estTotalSale} (${_.round(bestOrder.unitPrice,3)} each)`);
    } else {
      console.log('Sale failed: ' + sellResult);
    }
    return sellResult;
  } else {
    console.log('No deal found at an acceptable price. Best price=' + bestOrder.unitPrice);
    return OK;
  }
}

global.bestMineralBuyOrder = function(mineralType, roomName, energyPrice) {
  if (!mineralType || !RESOURCES_ALL.includes(mineralType)) {
    return ERR_INVALID_ARGS;
  }
  
  if (!energyPrice) {
    energyPrice = energyBuyPrice(50000, roomName);
  }

  let orders = Game.market.getAllOrders(
    o => o.type == ORDER_BUY &&
       o.resourceType == mineralType
  );
  
  for (let i=0; i < orders.length; i++) {
    let order = orders[i];
    let transactionCost = Game.market.calcTransactionCost(
      order.amount, order.roomName, roomName);
    let orderTotalPrice = order.amount * order.price - transactionCost * energyPrice;
    order.unitPrice = orderTotalPrice / order.amount;
  }
  
  let bestOrder = _.max(orders, 'unitPrice');
  console.log(`${bestOrder.id} ${bestOrder.amount} ${bestOrder.unitPrice}`);
  return bestOrder;
}

global.buyMineral = function(mineralType, roomName, maxAmount, maxPrice, energyPrice) {
  if (energyPrice == undefined) {
    energyPrice = DEFAULT_ENERGY_PRICE;
  }
  if (Math.floor(maxAmount) != maxAmount) {
    console.log('buyMineral(mineralType, roomName, maxAmount, maxPrice, energyPrice)');
    return ERR_INVALID_ARGS;
  }
  if (maxPrice > 0.3 || energyPrice > 0.1 || maxAmount > 100000) {
    // This is probably, though not certainly, an error.
    console.log('buyMineral(mineralType, roomName, maxAmount, maxPrice, energyPrice)');
    return ERR_INVALID_ARGS;
  }

  let bestOrder = bestMineralSellOrder(mineralType, roomName, energyPrice);
  //console.log('bestPrice = ' + bestOrder.unitPrice);
  let amount = Math.min(maxAmount, bestOrder.amount);

  if (bestOrder.unitPrice <= maxPrice) {
    //console.log('Buying from order ' + bestOrder.id + ' unitPrice = ' + bestOrder.unitPrice);
    let buyResult = Game.market.deal(bestOrder.id, amount, roomName);
    if (buyResult == OK) {
      console.log(`Bought ${amount} ${mineralType} for ${bestOrder.unitPrice}`);
    } else {
      console.log('Buy failed: ' + buyResult);
    }
  } else {
    console.log('No deal found at an acceptable price. Best price=' + bestOrder.unitPrice);
  }
}

global.bestMineralSellOrder = function(mineralType, roomName, energyPrice) {
  if (!mineralType || !RESOURCES_ALL.includes(mineralType)) {
    return ERR_INVALID_ARGS;
  }
  
  if (!energyPrice) {
    energyPrice = energyBuyPrice(50000, roomName);
  }

  let orders = Game.market.getAllOrders(o => o.type == ORDER_SELL && o.resourceType == mineralType && o.amount >= 500);
  
  for (let i=0; i < orders.length; i++) {
    let order = orders[i];
    let transactionCost = Game.market.calcTransactionCost(
      order.amount, order.roomName, roomName);
    let orderTotalPrice = order.amount * order.price + transactionCost * energyPrice;
    order.unitPrice = orderTotalPrice / order.amount;
  }
  
  let bestOrder = _.min(orders, 'unitPrice');
  //console.log(`${bestOrder.id} ${bestOrder.amount} ${bestOrder.unitPrice}`);
  return bestOrder;
}

let _cachedEnergyPrice;
let _energyCacheTime;

global.recentEnergyPrice = function() {
  updateEnergyPriceCache();

  return _cachedEnergyPrice;
}

function updateEnergyPriceCache() {
  if (_energyCacheTime + 2000 > Game.time) return;
  let recents = _.takeRight(Game.market.getHistory(RESOURCE_ENERGY),3);
  _cachedEnergyPrice = _.sum(recents, e => e.volume * e.avgPrice) / _.sum(recents, 'volume');
  _energyCacheTime = Game.time;
}

// If we have less energy than this, don't sell at all.
const LITTLE_ENERGY_AMOUNT = 400000;

const MUCH_ENERGY_AMOUNT = 575000;

// The price at which we'll sell if we have less than MUCH_ENERGY_AMOUNT;
const HIGH_ENERGY_PRICE = 30;

// The price at which we'll sell if we have more than MUCH_ENERGY_AMOUNT;
const LOW_ENERGY_PRICE = 15;

// Buy power from NPCs if the price is this or less
const NPC_POWER_PRICE = 600;

// Buy power from PCs if the price is this or less
const PC_POWER_PRICE = 600;

// Don't buy power from NPCs if there's this much in vaults
const NPC_POWER_BUY_RESERVE_CUTOFF = 1000000;

const POWER_BUY_ORDER_PRICE = 500;

// Buy power if at least this much credits on hand.
const CREDITS_REQUIRED_FOR_BUYING_POWER = 10 * 1000 * 1000 * 1000;

module.exports = {
  LITTLE_ENERGY_AMOUNT,
  MUCH_ENERGY_AMOUNT,
  HIGH_ENERGY_PRICE,
  LOW_ENERGY_PRICE,
  processBuys,
  processSales,
  setOrders,
  sellToNpcs,
  buyPower,
};
