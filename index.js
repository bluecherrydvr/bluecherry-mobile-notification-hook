
require('dotenv').config();

const redis = require('redis');
const express = require('express');
const { wrap } = require('@awaitjs/express');
const admin = require('firebase-admin');

const RedisPromise = require('./lib/redis-promise');

const redisClient = new RedisPromise(redis.createClient(process.env.REDIS_URL));

admin.initializeApp({
    credential: admin.credential.applicationDefault()
});

const app = express();
const port = process.env.APP_PORT;

const router = express.Router();



async function handleMotionEvent(serverId, clientTokens, {event_datetime, device_id, device_name, dvr_name}) {

    return admin.messaging().sendToDevice(Object.values(clientTokens), {
        notification: {
            title: 'Motion Event',
            body:  device_name
        },
        data: {serverId,
            eventType: 'motion_event',
            eventDateTime: String(event_datetime),
            deviceId: String(device_id),
            deviceName: device_name,
            dvrName: dvr_name

        }
    });

}

async function handleDeviceState(serverId, clientTokens, {event_datetime, device_id, device_name, state, dvr_name}) {

    return admin.messaging().sendToDevice(Object.values(clientTokens), {
        notification: {
            title: 'Device State Event',
            body:  state
        },
        data: {serverId, state,
            eventType: 'device_state',
            eventDateTime: String(event_datetime),
            deviceId: String(device_id),
            deviceName: device_name,
            dvrName: dvr_name
        }
    });

}

async function handleSolo(serverId, clientTokens, {event_datetime, state, dvr_name}) {

    return admin.messaging().sendToDevice(Object.values(clientTokens), {
        notification: {
            title: 'Solo Event',
            body:  state
        },
        data: {serverId, state,
            eventType: 'solo',
            eventDateTime: String(event_datetime),
            dvrName: dvr_name
        }
    });

}

app.use(express.json());
app.use('/notification-broker', router);

router.post('/store-token', wrap(async (req, res) => {

    const {server_id, client_id, token} = req.body;

    if (!server_id) {
        res.json({success: false, message: 'server id is not provided'});
        return;
    }

    if (!client_id) {
        res.json({success: false, message: 'client id is not provided'});
        return;
    }

    if (!token) {
        res.json({success: false, message: 'token is not provided'});
        return;
    }

    await redisClient.hset('server_token:' + server_id, client_id, token);
    await redisClient.hset('server_token_time:' + server_id, client_id, Date.now());

    res.json({success: true});

}));

router.post('/remove-token', wrap(async (req, res) => {

    const {server_id, client_id} = req.body;

    if (!server_id) {
        res.json({success: false, message: 'server id is not provided'});
        return;
    }

    if (!client_id) {
        res.json({success: false, message: 'client id is not provided'});
        return;
    }

    await redisClient.hdel('server_token:' + server_id, client_id);
    await redisClient.hdel('server_token_time:' + server_id, client_id);

    res.json({success: true});

}));

router.post('/hook/:serverId', wrap(async (req, res) => {

    const {serverId} = req.params;
    const {event_name, event_datetime} = req.body;

    if (!event_name) {
        res.json({success: false, message: 'event name is not provided'});
        return;
    }

    if (!event_datetime) {
        res.json({success: false, message: 'event datetime is not provided'});
        return;
    }

    const clientTokens = await redisClient.hgetall('server_token:' + serverId);

    if (!clientTokens) {
        res.json({success: false, message: 'there is no token associated this server id'});
        return;
    }

    switch (event_name) {
        case 'motion_event':
            await handleMotionEvent(serverId, clientTokens, req.body);
            break;
        case 'device_state':
            await handleDeviceState(serverId, clientTokens, req.body);
            break;
        case 'solo':
            await handleSolo(serverId, clientTokens, req.body);
            break;
        default:
            res.json({success: false, message: 'unknown event type'});
    }

    res.json({success: true});

}));



app.listen(port, () => {
    console.log(`app listening at http://localhost:${port}`);
});

