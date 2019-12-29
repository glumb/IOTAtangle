/* eslint-disable no-console */
// subber.js
const zmq = require('zeromq'),
    sock = zmq.socket('sub')
const events = require('events')
const eventEmitter = new events.EventEmitter()

module.exports = function (ZMQ_ENDPOINT) {

    sock.connect(ZMQ_ENDPOINT)
    console.log('connetciong to zmq: ', ZMQ_ENDPOINT)

    sock.subscribe('sn')
    sock.subscribe('tx')
    console.log('Subscriber connected to port 5556')

    sock.on('message', function (topic) {
        topic = topic.toString()

        if (topic.indexOf('tx ') == 0) {
            const elements = topic.split(' ')


            const hash = elements[1]
            const address = elements[2]
            const value = elements[3]
            // obsolete tag
            const timestamp = elements[5]
            const current_index = elements[6]
            const last_index = elements[7]
            const bundle_hash = elements[8]
            const transaction_trunk = elements[9]
            const transaction_branch = elements[10]
            // arrival time 11
            const tag = elements[12]

            eventEmitter.emit('tx', {
                hash,
                address,
                value,
                tag,
                timestamp,
                current_index,
                last_index,
                bundle_hash,
                transaction_trunk,
                transaction_branch,
            })

        }
        if (topic.indexOf('sn ') == 0) {

            const elements = topic.split(' ')

            const hash = elements[6]
            const address = elements[3]
            const transaction_trunk = elements[4]
            const transaction_branch = elements[5]
            const bundle = elements[6]

            eventEmitter.emit('sn', {
                hash,
                address,
                transaction_trunk,
                transaction_branch,
                bundle
            })

        }
    })

    return eventEmitter

}
