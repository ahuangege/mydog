var MAX_lEN = 10 * 1024 * 1024;
var encode = null;

var msgCoder = module.exports;

msgCoder.decode = function (tmpBuf, msg, cb) {
    var readLen = 0;
    while (readLen < msg.length) {
        if (tmpBuf.len === 0) //data length is unknow
        {
            tmpBuf.buffer = Buffer.concat([tmpBuf.buffer, new Buffer([msg[readLen]])]);
            if (tmpBuf.buffer.length === 4) {
                tmpBuf.len = tmpBuf.buffer.readUInt32BE();
                if (tmpBuf.len > MAX_lEN) {
                    cb("data too long");
                    return;
                }
                tmpBuf.buffer = new Buffer(tmpBuf.len);
            }
            readLen++;
        }
        else if (msg.length - readLen < tmpBuf.len)	// data not coming all
        {
            msg.copy(tmpBuf.buffer, tmpBuf.buffer.length - tmpBuf.len, readLen);
            tmpBuf.len -= (msg.length - readLen);
            readLen = msg.length;
        }
        else {
            msg.copy(tmpBuf.buffer, tmpBuf.buffer.length - tmpBuf.len, readLen, readLen + tmpBuf.len);

            readLen += tmpBuf.len;
            tmpBuf.len = 0;
            var data = tmpBuf.buffer;
            tmpBuf.buffer = new Buffer(0);

            //data coming all
            cb(null, data);
        }
    }
};

msgCoder.encodeInnerData = function (data) {
    data = JSON.stringify(data);
    data = new Buffer(data);
    var buffer = new Buffer(data.length + 4);
    buffer.writeUInt32BE(data.length);
    data.copy(buffer, 4);
    return buffer;
};

msgCoder.setClientEncode = function (_encode) {
    encode = _encode;
};

msgCoder.encodeClientData = function (cmd, data) {
    if (encode) {
        data = encode(cmd, data);
    } else {
        data = JSON.stringify(data);
        data = new Buffer(data);
    }
    var buffer = new Buffer(data.length + 5);
    buffer.writeUInt32BE(data.length + 1);
    buffer.writeUInt8(cmd, 4);
    data.copy(buffer, 5);
    return buffer;
};

