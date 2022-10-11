
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



async function handleMotionEvent(clientTokens, {server_uuid, event_datetime, device_id, device_name, dvr_name}) {

    return admin.messaging().sendToDevice(clientTokens, {
        notification: {
            title: 'Motion Event',
            body:  device_name
        },
        data: {
            serverId: server_uuid,
            eventType: 'motion_event',
            eventDateTime: String(event_datetime),
            deviceId: String(device_id),
            deviceName: device_name,
            dvrName: dvr_name
        }
    });

}

async function handleDeviceState(clientTokens, {server_uuid, event_datetime, device_id, device_name, state, dvr_name}) {

    return admin.messaging().sendToDevice(clientTokens, {
        notification: {
            title: 'Device State Event',
            body:  state
        },
        data: {serverId: server_uuid, state,
            eventType: 'device_state',
            eventDateTime: String(event_datetime),
            deviceId: String(device_id),
            deviceName: device_name,
            dvrName: dvr_name
        }
    });

}

async function handleSolo(clientTokens, {server_uuid, event_datetime, state, dvr_name}) {

    return admin.messaging().sendToDevice(clientTokens, {
        notification: {
            title: 'Solo Event',
            body:  state
        },
        data: {serverId: server_uuid, state,
            eventType: 'solo',
            eventDateTime: String(event_datetime),
            dvrName: dvr_name
        }
    });

}


async function handleMotionEventWithoutNotification(clientTokensWithoutNotification, {server_uuid, event_datetime, device_id, device_name, dvr_name}) {
    return Promise.all(clientTokensWithoutNotification.map(
        async (e) => {
            try {
                await admin.messaging().send({
                    token: e,
                    data: {
                        serverId: server_uuid,
                        eventType: 'motion_event',
                        eventDateTime: String(event_datetime),
                        deviceId: String(device_id),
                        deviceName: device_name,
                        dvrName: dvr_name
                    },
                    android: {
                        priority: "high",
                    },
                    apns: {
                        payload: {
                            aps: {
                                "content-available": 1,
                                "mutable-content": 1,
                            },
                        },
                        headers: {
                            "apns-push-type": "background",
                            "apns-priority": "5",
                        },
                    },
                });
            } catch (e) {
                console.log(e);
                // Do not prevent other [Promise]s from resolving, even if one [Promise] fails while sending data notification to one of the tokens.
            }
        }
    ));
}

async function handleDeviceStateWithoutNotification(clientTokensWithoutNotification, {server_uuid, event_datetime, device_id, device_name, state, dvr_name}) {
    return Promise.all(clientTokensWithoutNotification.map(
        async (e) => {
            try {
                await admin.messaging().send({
                    token: e,
                    data: {serverId: server_uuid, state,
                        eventType: 'device_state',
                        eventDateTime: String(event_datetime),
                        deviceId: String(device_id),
                        deviceName: device_name,
                        dvrName: dvr_name
                    },
                    android: {
                        priority: "high",
                    },
                    apns: {
                        payload: {
                            aps: {
                                "content-available": 1,
                                "mutable-content": 1,
                            },
                        },
                        headers: {
                            "apns-push-type": "background",
                            "apns-priority": "5",
                        },
                    },
                });
            } catch (e) {
                console.log(e);
                // Do not prevent other [Promise]s from resolving, even if one [Promise] fails while sending data notification to one of the tokens.
            }
        }
    ));
}

async function handleSoloWithoutNotification(clientTokensWithoutNotification, {server_uuid, event_datetime, state, dvr_name}) {
    return Promise.all(clientTokensWithoutNotification.map(
        async (e) => {
            try {
                await admin.messaging().send({
                    token: e,
                    data: {serverId: server_uuid, state,
                        eventType: 'solo',
                        eventDateTime: String(event_datetime),
                        dvrName: dvr_name
                    },
                    android: {
                        priority: "high",
                    },
                    apns: {
                        payload: {
                            aps: {
                                "content-available": 1,
                                "mutable-content": 1,
                            },
                        },
                        headers: {
                            "apns-push-type": "background",
                            "apns-priority": "5",
                        },
                    },
                });
            } catch (e) {
                console.log(e);
                // Do not prevent other [Promise]s from resolving, even if one [Promise] fails while sending data notification to one of the tokens.
            }
        }
    ));
}

app.use(express.json());
app.use('/notification-broker', router);

router.post('/store-token', wrap(async (req, res) => {

    const {server_id, client_id, token, disable_payload_notification } = req.body;

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
    if (disable_payload_notification == true /* could be `undefined` */) {
        await redisClient.hset('server_disable_payload_notification:' + server_id, client_id, disable_payload_notification);
    }
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
    if (await redisClient.hexists('server_disable_payload_notification:' + server_id, client_id)) {
        await redisClient.hdel('server_disable_payload_notification:' + server_id, client_id);
    }
    res.json({success: true});

}));

router.post('/hook', wrap(async (req, res) => {

    const {event_name, event_datetime, server_uuid} = req.body;

    if (!server_uuid) {
        res.json({success: false, message: 'server uuid is not provided'});
        return;
    }

    if (!event_name) {
        res.json({success: false, message: 'event name is not provided'});
        return;
    }

    if (!event_datetime) {
        res.json({success: false, message: 'event datetime is not provided'});
        return;
    }

    // Fetch all the client tokens registered with a given `server_uuid`.
    const clientTokensAll = await redisClient.hgetall('server_token:' + server_uuid);
    const clientDisablePayloadNotifications = await redisClient.hgetall('server_disable_payload_notification:' + server_uuid);

    if (!clientTokensAll) {
        res.json({success: false, message: 'there is no token associated this server id'});
        return;
    }

    // `clientTokens` is the array of client tokens which must contain the `notification` key in FCM payload.
    // `clientTokensWithoutNotification` is the array of client tokens which must NOT contain the `notification` key in FCM payload.
    const clientTokens = [], clientTokensWithoutNotification = [];
    // Split `clientTokensAll` into:
    // 1. `clientTokens`
    // 2. `clientTokensWithoutNotification`
    for (const [key, value] of Object.entries(clientTokensAll)) {
        if (typeof clientDisablePayloadNotifications === 'object' && clientDisablePayloadNotifications[key] == true) {
            clientTokensWithoutNotification.push(value);
        } else {
            clientTokens.push(value);
        }
    }
    
    switch (event_name) {
        case 'motion_event':
            await Promise.all([
                handleMotionEvent(clientTokens, req.body),
                handleMotionEventWithoutNotification(clientTokensWithoutNotification, req.body),
            ]);
            break;
        case 'device_state':
            await Promise.all([
                handleDeviceState(clientTokens, req.body),
                handleDeviceStateWithoutNotification(clientTokensWithoutNotification, req.body),
            ]);
            break;
        case 'solo':
            await Promise.all([
                handleSolo(clientTokens, req.body),
                handleSoloWithoutNotification(clientTokensWithoutNotification, req.body),
            ]);
            break;
        default:
            res.json({success: false, message: 'unknown event type'});
    }

    res.json({success: true});

}));



app.listen(port, () => {
    console.log(`app listening at http://localhost:${port}`);
});

