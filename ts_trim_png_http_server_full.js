const http = require('follow-redirects').http;
const https = require('follow-redirects').https;
const fs = require('fs');

let m3u8_dir = process.argv[2];
let url_prefix = process.argv[3];

const TYPE_PNG     = 0;
const TYPE_TS      = 1;
const TYPE_UNKNOWN = 2;

const PNG_MAGIC_SIZE = 8;

// From https://stackoverflow.com/a/50579690/1213644
// Modified to support Buffer as input
var crc32=function(r){for(var a,o=[],c=0;c<256;c++){a=c;for(var f=0;f<8;f++)a=1&a?3988292384^a>>>1:a>>>1;o[c]=a}for(var n=-1,t=0;t<r.length;t++)n=n>>>8^o[255&(n^r[t])];return(-1^n)>>>0};

function check_ts_or_png(data) {
    if (data.length < 8) {
        return TYPE_UNKNOWN;
    }

    // Check if we may be getting a complete chunk of PNG.
    
    let chunk_data_len = data.readInt32BE(0);

    if (data.length < chunk_data_len + 12) {
        // Need complete data for the chunk (if it is a PNG chunk) to verify if it is actually a PNG chunk
        return TYPE_UNKNOWN;
    }

    // We may have a complete chunk of PNG, at least according to size

    if (data[0] != 0x47) { // 0x47, 'G'
        // We have a complete chunk of PNG, because a TS chunk cannot start with non-'G' character
        return TYPE_PNG;
    }

    // If it is 'G', it may or may not be TS. Check CRC. If CRC matches, it is very likely to be PNG (can also be TS under collision, but we assume that will not happen). Otherwise, it must be TS.

    let calculated_crc32 = crc32(data.slice(4, 8 + chunk_data_len));
    let given_crc32 = data.readInt32BE(8 + chunk_data_len);

    if (calculated_crc32 == given_crc32) {
        return TYPE_PNG;
    } else {
        return TYPE_TS;
    }
}

const requestListener = function (req, res) {
    if (req.url.endsWith('.m3u8')) {
        fs.readFile(m3u8_dir + '/' + req.url, function(err, data) {
            if (err) {
                res.writeHead(404);
            } else {
                res.writeHead(200);
                res.end(data);
            }
        });
        return;
    }

    console.log('GET request for ' + req.url);
    console.log(req.headers.range);

    http_or_https = (url_prefix + req.url).startsWith('http://') ? http : https;

    let subreq = http_or_https.get(url_prefix + req.url, (subres) => {
        req.on('close', () => {
            subreq.destroy();
            console.log('Client closed GET request for ' + req.url);
        });

        if (subres.statusCode !== 200) {
            console.error(`Did not get an OK from the server. Code: ${subres.statusCode}`);
            subres.resume();
            res.writeHead(subres.statusCode);
            res.end();
        } else {
            res.writeHead(200);

            let received_len = 0;

            let all_ts = false;

            let pending_data = Buffer.alloc(0);

            subres.on('data', (chunk) => {
                if (all_ts) {
                    res.write(chunk);
                } else  {
                    if (received_len < PNG_MAGIC_SIZE) {
                        let to_skip = PNG_MAGIC_SIZE - received_len;
                        received_len += chunk.length;
                        chunk = chunk.slice(to_skip);
                        if (chunk.length == 0) {
                            return;
                        }
                    }

                    pending_data = Buffer.concat([pending_data, chunk]);

                    let check_res = check_ts_or_png(pending_data);

                    while (check_res == TYPE_PNG) {
                        let chunk_data_len = pending_data.readInt32BE(0);
                        pending_data = pending_data.slice(12 + chunk_data_len);
                        check_res = check_ts_or_png(pending_data);
                    }

                    if (check_res == TYPE_TS) {
                        all_ts = true;
                        res.write(pending_data);
                        pending_data = null;
                    }
                }
            });

            subres.on('end', () => {
                if (pending_data != null) {
                    // Finally still don't get enough data to verify if the pending data is a PNG chunk. In this case, it must be a TS chunk.
                    // This is the common case for real world use of this script.
                    // Sending everything at the end can hurt performance and/or eat up memory. You should use the _header or _simple scripts for most cases.
                    res.write(pending_data);
                }
                res.end();
                console.log('Finished GET request for ' + req.url);
            });
        }
    });
}

const server = http.createServer(requestListener);
server.listen(8080);
