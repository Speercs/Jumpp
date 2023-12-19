'use strict';

function parseOrders() {
    for (let key in Game.market.orders) {
        let order = Game.market.orders[key];
        let room = Game.rooms[order.roomName];
        if (!room) {
            continue;
        }
        
        if (room._orders) {
            room._orders.push(order);
        } else {
            room._orders = [order];
        }
    }
}

Object.defineProperty(Room.prototype, 'orders', {
    get: function() {
        if (this._orders) {
            return this._orders;
        } else {
            parseOrders();
            return this._orders;
        }
    },
    set: function(){},
    enumerable: false,
    configurable: true,
});
