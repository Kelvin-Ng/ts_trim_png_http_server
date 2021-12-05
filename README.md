# TS-Trim-PNG HTTP Server

## TL;DR

There are three versions. The simple version (`ts_trim_png_http_server_simple.js`) is the best for most, if not all, practical scenario.

## What is this

This is a tool to help you watch TS videos with PNG prepended. This seems very common because some people use this method to upload videos to image storage services.

You found out a way to download a video (e.g., you get the m3u8 file and get the link to the actual video), but after downloading the video, the file is recognized as a PNG image (when opened with media player of web browser). If this is the case, this script is for you.

This is an HTTP server intended to be held and accessed locally. When you access a video through this server, the server will retrieve the video from the actual source, trim the prepended PNG, and send to the client. You can stream videos with this HTTP server.

## Usage

In this section, we use the simple version as examples. All versions have the same usage except the name of the script.

```
node ts_trim_png_http_server_simple.js /path/to/dir/with/m3u8 <prefix to be prepended to the urls in m3u8>
```

For example, you downloaded an m3u8 file from `http://hello.world/foo/playlist.m3u8`. The file is stored at `~/videos/playlist.m3u8`. Each line in the playlist is like `/a/b/c/001.ts`. You will want to run the script like this:

```
node ts_trim_png_http_server_simple.js ~/videos http://hello.world
```

As another example, if each line in the playlist is like `a/b/001.ts`, you should run in this way:

```
node ts_trim_png_http_server_simple.js ~/videos http://hello.world/foo/
```

Note the difference between relative and absolute paths.

After running the script, use your favorite media player to play `http://127.0.0.1:8080/playlist.m3u8`. The video will be streamed without needing to download in advance. But you can always download the video through this server as well.

## Versions

There are three versions. The simple version (`ts_trim_png_http_server_simple.js`) is the best for most, if not all, practical scenario. The full version is there mainly for completeness -- it is not better than the simple version in all practical situations I have faced. The header version is the first version I wrote. It works perfectly in all cases I have tried, but it does not have theoretical guarantees on correctness.

### Simple

The script assumes that the prepended PNG file is smaller than 0x47000000 bytes (around 1.1 GiB). This is true in most, if not all, practical scenario. When this assumption holds, the script will accurately trim the PNG file, without trimming anything more or anything less.

It works by checking if the first byte of the remaining bytes is 0x47. If yes, all remaining bytes are treated as TS packets. Otherwise, it is treated as a PNG chunk. The whole chunk will be removed and the process repeats.

### Header

This script only trims the PNG header (first 8 bytes) and will leave garbage before the start of the first TS packet. This seems fine in practice, but the simple version above may be more reliable.

### Full

This script is useful if the assumption needed for the simple version does not hold.

If the first byte of the remaining bytes is 0x47, it consider it as a hypothetical PNG chunk. Then, it verifies the CRC. If CRC matches, it is considered as PNG chunk. The whole chunk will be removed and the process repeats. If CRC does not match, all remaining bytes are treated as TS packets.

This script is not useful in practice. First, the assumption needed by the simple version almost always holds. Second, this script will need to wait for at least `min(0x47000000 bytes, file size)` to download before running the CRC check. This wastes memory space and hurts performance.

