
const { promisify } = require('util');

const methods = ['get', 'set', 'exists', 'sadd', 'sismember', 'hexists', 'hget', 'hset', 'hsetnx', 'hdel', 'smembers', 'hgetall'];

class RedisPromise {
    constructor(redisClient) {
        this.originalClient = redisClient;

        for (const method of methods) {
            this[method] = promisify(redisClient[method]).bind(redisClient);
        }
    }
}

module.exports = RedisPromise;