const http = require('follow-redirects').http;
const https = require('follow-redirects').https;
const fs = require('fs');

let m3u8_dir = process.argv[2];
let url_prefix = process.argv[3];

const TYPE_PNG     = 0; // A complete PNG chunk
const TYPE_TS      = 1; // Some (but not necessarily complete) TS data
const TYPE_UNKNOWN = 2; // Otherwise

const PNG_MAGIC_SIZE = 8;

function check_ts_or_png(data) {
    if (data[0] == 0x47) { // 0x47, 'G'
        // In this script, we assume that the size of the prepended PNG is < 0x47000000 bytes (i.e., around 1.1 GiB).
        // In this case, a PNG chunk will never start with 0x47, because otherwise the chunk must be >= 0x47000000 bytes.
        // So, the chunk must be a TS chunk.
        return TYPE_TS;
    }

    // If data[0] is not 'G', it must be a part of, or a complete, PNG chunk

    if (data.length < 8) {
        return TYPE_UNKNOWN;
    }

    let chunk_data_len = data.readInt32BE(0);
    if (data.length < chunk_data_len + 12) {
        return TYPE_UNKNOWN;
    }

    return TYPE_PNG;
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

    let subreq = https.get(url_prefix + req.url, (subres) => {
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
                res.end();
                console.log('Finished GET request for ' + req.url);
            });
        }
    });
}

const server = http.createServer(requestListener);
server.listen(8080);
