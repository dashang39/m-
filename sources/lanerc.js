/*
 * Lanerc 1.08
 * 2026-10-01：原版 APK 1.0.8（versionCode 32）不写死 API 域名。
 * dohx.lanerc.moe 的 TXT 现解密为 https://v3.yyghk.com/；dapi.jngaoke.cn 已超时，只作过期域名跳过。
 * 不要自己写 Accept-Encoding。详情和验证码都会被源站 gzip，脚本带上这个头后 OkHttp 不再透明解压。
 * v2/play 和原版一样只提交 resource_id。能匿名播的集直接回正片地址。
 * 匿名只回 yximgs 广告片的集，原版是登录账号后带 Bearer 再请求，不走验证码。
 */

var _LANERC_DISCOVERY = 'https://anime999x-1366475786.cos.ap-guangzhou.myqcloud.com/apis.json';
var _LANERC_DISCOVERY_DOMAIN = 'uminainfo.cc';
var _LANERC_DISCOVERY_PATH = 'api.json';
var _LANERC_DOH_NAMES = ['dohx.lanerc.moe', 'doh.lanercdns1.cc', 'doh.uminadns2.cc'];
var _LANERC_DOH_RESOLVERS = [
    'https://doh.pub/',
    'https://dns.alidns.com/',
    'https://doh.360.cn/',
    'https://1.12.12.12/',
    'https://223.5.5.5/',
    'https://dns.google/'
];
var _LANERC_DOH_DECRYPT_KEY = '2dd30ebfb8ed481a3317036eaf7ed3da';
var _LANERC_HEALTH_SECRET = '4x2g5efd84fb46a9';
var _LANERC_FALLBACK_HOST = 'https://v3.yyghk.com/';
/* 官方 API 走 DNS TXT，不固化 A 记录；需要时仍可通过 ext.directIp 显式指定。 */
var _LANERC_DIRECT_IP = '';
var _LANERC_LEGACY_DIRECT_IP = '111.124.66.133';
var _LANERC_DIRECT_HOST = 'v3.yyghk.com';
var _LANERC_DIRECT_HOST_URL = '';
 
var _LANERC_PROBE_TIMEOUT_MS = 3000;

var _LANERC_WARNING_PLAYLIST_TIMEOUT_MS = 3000;
var _LANERC_BLOCK_WARNING_PLAYLIST = true;
var _LANERC_BROWSE_ONLY = false;
var _LANERC_STALE_HOST = 'https://server.jngaoke.cn/';
var _LANERC_AUTH_FALLBACK = 'com.clggjv.xcjfmd.ffo';
var _LANERC_DECRYPT_KEY = '8f81c2519e3b661834219e7142000093';
var _LANERC_RUNTIME_CONFIG_PATH = 'app/config';
var _LANERC_V2_DETAIL_PATH = 'app/v2/vod/';
var _LANERC_V2_PLAY_PATH = 'app/v2/play';
var _LANERC_GUEST_CAPTCHA_PATH = 'app/v2/guest/captcha';
var _LANERC_GUEST_CREDENTIAL_PATH = 'app/v2/guest/credential';
var _LANERC_GUEST_PLAY_PATH = 'app/v2/guest/play';
var _LANERC_GUEST_CREDENTIAL_STORAGE_KEY = 'lanerc_guest_credential_v1';
var _LANERC_USER_TOKEN_STORAGE_KEY = 'lanerc_user_token_v1';
var _LANERC_GUEST_CAPTCHA_CACHE_KEY = 'lanerc_guest_captcha_cache_v1';
var _LANERC_GUEST_CAPTCHA_LOCK_KEY = 'lanerc_guest_captcha_lock_v1';
var _LANERC_PLAY_RESOLVE_KEY_HEX = '5a31fe3201838a69e8f9c135f7905db25208fbc6bc3f0a9b017fc5139a451108';
var _LANERC_PLAY_RESOLVE_PATH = 'app/proxyx4x';
var _LANERC_OFFICIAL_MEDIA_HOSTS = ['http://static.shangji.asia', 'https://file.shangji.asia'];
var _LANERC_OFFICIAL_MEDIA_BUCKETS = ['10', '13', '2'];
var _LANERC_LEGACY_MEDIA_BY_CONTENT = {
    '688': ['416c3fbe42da2d20d70f28e7709bc8f6']
};
var _LANERC_PLAY_RESOLVER = 'auto';
 
var _LANERC_BUILD_SIGNATURE = '74322D4D62B9F4A986DFA8973EE70EBC034E74551B8715C755EDD9ED18E6820B';
 
var _LANERC_QUERY_SIGN_SECRET = '4x2g5efd84fb46a9';

var _LANERC_API_UA = 'Dart/3.9.2';
var _LANERC_JSON_CONTENT_TYPE = 'application/json';
var _LANERC_GUEST_JSON_UA = 'Dart/3.9 (dart:io)';
var _LANERC_GUEST_JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
var _lanercExt = typeof ext === 'object' && ext ? ext : {};
var _lanercHost = '';
var _lanercHome = null;
var _lanercDirectUsed = false;
var _lanercRuntime = null;


var _lanercLastDetail = null;



function _legacyTrim(value) {
    return value === null || value === undefined ? '' : String(value).replace(/^\s+|\s+$/g, '');
}



function _legacyIsArray(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
}



function _legacyOwn(object, key) {
    return object !== null && object !== undefined &&
        Object.prototype.hasOwnProperty.call(object, key);
}



function _lanercLog(message) {
    try {
        log('[Lanerc旧版源] ' + message);
    } catch (error) {
        
    }
}



function _lanercBoolean(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    var normalized = String(value).toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return fallback;
}



function config() {
    return JSON.stringify({
        browseOnly: _lanercBoolean(_lanercExt.browseOnly, _LANERC_BROWSE_ONLY)
    });
}



function _normalizeHost(host) {
    var value = _legacyTrim(host);
    if (!value) return '';
    if (/^Ahttps?:\/\//i.test(value)) value = value.slice(1);
    if (/^\/\//.test(value)) value = 'https:' + value;
    else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = 'https://' + value;
    else if (/^http:\/\//i.test(value) && !_lanercAllowHttpFallback()) value = 'https://' + value.slice(7);
    return value.replace(/\/+$/, '') + '/';
}

function _isLegacyLanercIpHost(host) {
    var value = _normalizeHost(host);
    return /^https?:\/\/(?:123\.6\.149\.136|111\.124\.66\.133)(?:\/|$)/i.test(value);
}



function _lanercAllowHttpFallback() {
    return _lanercBoolean(_lanercExt.allowHttpFallback, false) ||
        String(_lanercExt.apiScheme || '').toLowerCase() === 'http';
}


function _lanercDirectIp() {
    var supplied = _legacyTrim(_lanercExt.apiIp || _lanercExt.directIp || '');
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(supplied)) return supplied;
    return _LANERC_DIRECT_IP;
}


function _lanercDirectHostUrl() {
    var ip = _lanercDirectIp();
    return ip ? 'http://' + ip + '/' : '';
}


function _lanercIsDirectApiUrl(url) {
    var value = String(url || '');
    var candidates = [_lanercDirectIp(), _LANERC_DIRECT_IP, _LANERC_LEGACY_DIRECT_IP];
    for (var index = 0; index < candidates.length; index += 1) {
        if (candidates[index] && new RegExp('^https?://' + String(candidates[index]).replace(/\./g, '\\.') + '(?:/|$)', 'i').test(value)) {
            return true;
        }
    }
    return false;
}



function _normalizeDiscoveredHost(host) {
    var value = _legacyTrim(host)
        .replace(/^['"]+|['"]+$/g, '')
        .replace(/\\\//g, '/');
    if (!value) return '';
    if (/^Ahttps?:\/\//i.test(value)) value = value.slice(1);
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^\/\//.test(value)) {
        value = 'https://' + value;
    }
    var normalized = _normalizeHost(value);
    if (!/^https?:\/\/[a-z0-9.-]+(?::\d+)?\/$/i.test(normalized)) return '';
    return normalized;
}



function _isStaleLanercHost(host) {
    var value = _normalizeHost(host).toLowerCase();
    return /^https?:\/\/(?:server|lol|dapi)\.jngaoke\.cn(?:\/|$)/i.test(value) ||
        /^https?:\/\/(?:123\.6\.149\.136|111\.124\.66\.133)(?:\/|$)/i.test(value);
}



function _safeParse(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
        var parsed = parseJson(String(value));
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (error) {
        return fallback;
    }
}



function _decryptOptions() {
    var config = _lanercExt.decrypt;
    if (typeof config === 'string') config = _safeParse(config, {});
    if (!config || typeof config !== 'object') return {};
    return config;
}



var _LANERC_AES_FALLBACK = (function () {
    var inverseSbox = [
        0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
        0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
        0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
        0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
        0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
        0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
        0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
        0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
        0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
        0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
        0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
        0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
        0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
        0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
        0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
        0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d
    ];
    var sbox = [
        0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
        0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
        0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
        0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
        0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
        0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
        0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
        0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
        0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
        0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
        0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
        0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
        0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
        0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
        0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
        0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
    ];
    var roundConstants = [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];

     
    function _aesXtime(value) {
        return ((value << 1) ^ (((value >> 7) & 1) * 0x1b)) & 0xff;
    }

     
    function _aesExpandKey(key) {
        var keyWords = 8;
        var rounds = 14;
        var totalWords = 4 * (rounds + 1);
        var expanded = new Array(totalWords * 4);
        var index;
        for (index = 0; index < keyWords * 4; index += 1) expanded[index] = key[index];
        for (var word = keyWords; word < totalWords; word += 1) {
            var previous = (word - 1) * 4;
            var value = [expanded[previous], expanded[previous + 1], expanded[previous + 2], expanded[previous + 3]];
            if (word % keyWords === 0) {
                value = [
                    sbox[value[1]] ^ roundConstants[word / keyWords - 1],
                    sbox[value[2]],
                    sbox[value[3]],
                    sbox[value[0]]
                ];
            } else if (word % keyWords === 4) {
                value = [sbox[value[0]], sbox[value[1]], sbox[value[2]], sbox[value[3]]];
            }
            for (index = 0; index < 4; index += 1) {
                expanded[word * 4 + index] = expanded[(word - keyWords) * 4 + index] ^ value[index];
            }
        }
        return expanded;
    }

     
    function _aesInverseShiftAndSubstitute(state) {
        var shifted = [
            state[0], state[13], state[10], state[7],
            state[4], state[1], state[14], state[11],
            state[8], state[5], state[2], state[15],
            state[12], state[9], state[6], state[3]
        ];
        for (var index = 0; index < 16; index += 1) shifted[index] = inverseSbox[shifted[index]];
        return shifted;
    }

     
    function _aesInverseMixColumns(state) {
        for (var column = 0; column < 4; column += 1) {
            var offset = column * 4;
            var a = state[offset];
            var b = state[offset + 1];
            var c = state[offset + 2];
            var d = state[offset + 3];
            var a2 = _aesXtime(a), b2 = _aesXtime(b), c2 = _aesXtime(c), d2 = _aesXtime(d);
            var a4 = _aesXtime(a2), b4 = _aesXtime(b2), c4 = _aesXtime(c2), d4 = _aesXtime(d2);
            var a8 = _aesXtime(a4), b8 = _aesXtime(b4), c8 = _aesXtime(c4), d8 = _aesXtime(d4);
            var a14 = a2 ^ a4 ^ a8, b14 = b2 ^ b4 ^ b8, c14 = c2 ^ c4 ^ c8, d14 = d2 ^ d4 ^ d8;
            var a11 = a8 ^ a2 ^ a, b11 = b8 ^ b2 ^ b, c11 = c8 ^ c2 ^ c, d11 = d8 ^ d2 ^ d;
            var a13 = a8 ^ a4 ^ a, b13 = b8 ^ b4 ^ b, c13 = c8 ^ c4 ^ c, d13 = d8 ^ d4 ^ d;
            var a9 = a8 ^ a, b9 = b8 ^ b, c9 = c8 ^ c, d9 = d8 ^ d;
            state[offset] = (a14 ^ b11 ^ c13 ^ d9) & 0xff;
            state[offset + 1] = (a9 ^ b14 ^ c11 ^ d13) & 0xff;
            state[offset + 2] = (a13 ^ b9 ^ c14 ^ d11) & 0xff;
            state[offset + 3] = (a11 ^ b13 ^ c9 ^ d14) & 0xff;
        }
    }

     
    function _aesDecryptBlock(block, expanded) {
        var rounds = 14;
        var state = block.slice();
        var index;
        for (index = 0; index < 16; index += 1) state[index] ^= expanded[rounds * 16 + index];
        for (var round = rounds - 1; round >= 1; round -= 1) {
            state = _aesInverseShiftAndSubstitute(state);
            for (index = 0; index < 16; index += 1) state[index] ^= expanded[round * 16 + index];
            _aesInverseMixColumns(state);
        }
        state = _aesInverseShiftAndSubstitute(state);
        for (index = 0; index < 16; index += 1) state[index] ^= expanded[index];
        return state;
    }

    function _aesMixColumns(state) {
        for (var column = 0; column < 4; column += 1) {
            var offset = column * 4;
            var a = state[offset];
            var b = state[offset + 1];
            var c = state[offset + 2];
            var d = state[offset + 3];
            var a2 = _aesXtime(a), b2 = _aesXtime(b), c2 = _aesXtime(c), d2 = _aesXtime(d);
            state[offset] = (a2 ^ (b2 ^ b) ^ c ^ d) & 0xff;
            state[offset + 1] = (a ^ b2 ^ (c2 ^ c) ^ d) & 0xff;
            state[offset + 2] = (a ^ b ^ c2 ^ (d2 ^ d)) & 0xff;
            state[offset + 3] = ((a2 ^ a) ^ b ^ c ^ d2) & 0xff;
        }
    }

    function _aesEncryptBlock(block, expanded) {
        var rounds = 14;
        var state = block.slice();
        var index;
        for (index = 0; index < 16; index += 1) state[index] ^= expanded[index];
        for (var round = 1; round < rounds; round += 1) {
            for (index = 0; index < 16; index += 1) state[index] = sbox[state[index]];
            state = [
                state[0], state[5], state[10], state[15],
                state[4], state[9], state[14], state[3],
                state[8], state[13], state[2], state[7],
                state[12], state[1], state[6], state[11]
            ];
            _aesMixColumns(state);
            for (index = 0; index < 16; index += 1) state[index] ^= expanded[round * 16 + index];
        }
        for (index = 0; index < 16; index += 1) state[index] = sbox[state[index]];
        state = [
            state[0], state[5], state[10], state[15],
            state[4], state[9], state[14], state[3],
            state[8], state[13], state[2], state[7],
            state[12], state[1], state[6], state[11]
        ];
        for (index = 0; index < 16; index += 1) state[index] ^= expanded[rounds * 16 + index];
        return state;
    }

    function _gcmXor(left, right) {
        var result = [];
        for (var index = 0; index < 16; index += 1) result[index] = left[index] ^ right[index];
        return result;
    }

    function _gcmMultiply(left, right) {
        var result = new Array(16).fill(0);
        var value = right.slice();
        for (var bitIndex = 0; bitIndex < 128; bitIndex += 1) {
            if ((left[bitIndex >> 3] & (0x80 >> (bitIndex & 7))) !== 0) {
                result = _gcmXor(result, value);
            }
            var lsb = value[15] & 1;
            for (var byteIndex = 15; byteIndex > 0; byteIndex -= 1) {
                value[byteIndex] = (value[byteIndex] >> 1) | ((value[byteIndex - 1] & 1) << 7);
            }
            value[0] = value[0] >> 1;
            if (lsb) value[0] ^= 0xe1;
        }
        return result;
    }

    function _gcmHash(ciphertext, hashSubkey) {
        var accumulator = new Array(16).fill(0);
        for (var offset = 0; offset < ciphertext.length; offset += 16) {
            var block = new Array(16).fill(0);
            for (var index = 0; index < 16 && offset + index < ciphertext.length; index += 1) {
                block[index] = ciphertext[offset + index];
            }
            accumulator = _gcmMultiply(_gcmXor(accumulator, block), hashSubkey);
        }
        var lengths = new Array(16).fill(0);
        var bitLength = ciphertext.length * 8;
        for (var bit = 0; bit < 8; bit += 1) {
            lengths[15 - bit] = (bitLength / Math.pow(2, bit * 8)) & 0xff;
        }
        accumulator = _gcmMultiply(_gcmXor(accumulator, lengths), hashSubkey);
        return accumulator;
    }

    function _gcmIncrement(counter) {
        var next = counter.slice();
        for (var index = 15; index >= 12; index -= 1) {
            next[index] = (next[index] + 1) & 0xff;
            if (next[index] !== 0) break;
        }
        return next;
    }

    function _aesHexBytes(value) {
        var text = String(value || '').replace(/[^0-9a-f]/gi, '');
        if (text.length % 2) text = '0' + text;
        var result = [];
        for (var index = 0; index < text.length; index += 2) result.push(parseInt(text.substr(index, 2), 16));
        return result;
    }

     
    function _aesTextBytes(value) {
        var result = [];
        for (var index = 0; index < value.length; index += 1) result.push(value.charCodeAt(index) & 0xff);
        return result;
    }

     
    function _aesBase64Bytes(value) {
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var lookup = {};
        var output = [];
        var index;
        for (index = 0; index < 64; index += 1) lookup[alphabet.charAt(index)] = index;
        var input = String(value || '').replace(/[^A-Za-z0-9+/=]/g, '');
        for (index = 0; index < input.length; index += 4) {
            var first = lookup[input.charAt(index)];
            var second = lookup[input.charAt(index + 1)];
            var thirdChar = input.charAt(index + 2);
            var fourthChar = input.charAt(index + 3);
            var third = thirdChar === '=' || thirdChar === '' ? -1 : lookup[thirdChar];
            var fourth = fourthChar === '=' || fourthChar === '' ? -1 : lookup[fourthChar];
            output.push(((first << 2) | (second >> 4)) & 0xff);
            if (third !== -1) output.push((((second & 0x0f) << 4) | (third >> 2)) & 0xff);
            if (fourth !== -1) output.push((((third & 0x03) << 6) | fourth) & 0xff);
        }
        return output;
    }

    function _aesBase64Encode(bytes) {
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var output = '';
        for (var index = 0; index < bytes.length; index += 3) {
            var first = bytes[index] & 0xff;
            var hasSecond = index + 1 < bytes.length;
            var hasThird = index + 2 < bytes.length;
            var second = hasSecond ? bytes[index + 1] & 0xff : 0;
            var third = hasThird ? bytes[index + 2] & 0xff : 0;
            output += alphabet.charAt(first >> 2);
            output += alphabet.charAt(((first & 3) << 4) | (second >> 4));
            output += hasSecond ? alphabet.charAt(((second & 15) << 2) | (third >> 6)) : '=';
            output += hasThird ? alphabet.charAt(third & 63) : '=';
        }
        return output;
    }

     
    function _aesUtf8Text(bytes, length) {
        var output = '';
        var index = 0;
        while (index < length) {
            var code = bytes[index++];
            if (code < 0x80) {
                output += String.fromCharCode(code);
            } else if (code < 0xe0) {
                output += String.fromCharCode(((code & 0x1f) << 6) | (bytes[index++] & 0x3f));
            } else if (code < 0xf0) {
                output += String.fromCharCode(
                    ((code & 0x0f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f)
                );
            } else {
                var point = ((code & 0x07) << 18) | ((bytes[index++] & 0x3f) << 12) |
                    ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f);
                point -= 0x10000;
                output += String.fromCharCode(0xd800 + (point >> 10), 0xdc00 + (point & 0x3ff));
            }
        }
        return output;
    }

    return {
         
        decryptBase64: function (base64, keyText) {
            var key = _aesTextBytes(String(keyText || ''));
            if (key.length !== 32) throw new Error('内置 AES-256 要求 32 字节密钥');
            var cipher = _aesBase64Bytes(base64);
            if (!cipher.length || cipher.length % 16 !== 0) throw new Error('AES 密文长度不是 16 的倍数');
            var expanded = _aesExpandKey(key);
            var plain = [];
            for (var offset = 0; offset < cipher.length; offset += 16) {
                var block = _aesDecryptBlock(cipher.slice(offset, offset + 16), expanded);
                for (var index = 0; index < 16; index += 1) plain.push(block[index]);
            }
            var padding = plain[plain.length - 1];
            if (padding < 1 || padding > 16) throw new Error('AES PKCS7 padding 无效');
            for (var padIndex = plain.length - padding; padIndex < plain.length; padIndex += 1) {
                if (plain[padIndex] !== padding) throw new Error('AES PKCS7 padding 不一致');
            }
            return _aesUtf8Text(plain, plain.length - padding);
        },
        decryptGcmBase64: function (ciphertextBase64, keyHex, ivBase64) {
            var key = _aesHexBytes(keyHex);
            var nonce = _aesBase64Bytes(ivBase64);
            var input = _aesBase64Bytes(ciphertextBase64);
            if (key.length !== 32 || nonce.length !== 12 || input.length < 16) {
                throw new Error('AES-GCM 参数长度非法');
            }
            var ciphertext = input.slice(0, input.length - 16);
            var tag = input.slice(input.length - 16);
            var expanded = _aesExpandKey(key);
            var zero = new Array(16).fill(0);
            var hashSubkey = _aesEncryptBlock(zero, expanded);
            var j0 = nonce.concat([0, 0, 0, 1]);
            var expectedTag = _gcmXor(_aesEncryptBlock(j0, expanded), _gcmHash(ciphertext, hashSubkey));
            var mismatch = 0;
            for (var tagIndex = 0; tagIndex < 16; tagIndex += 1) mismatch |= expectedTag[tagIndex] ^ tag[tagIndex];
            if (mismatch !== 0) throw new Error('AES-GCM authentication failed');
            var plain = [];
            var counter = _gcmIncrement(j0);
            for (var offset = 0; offset < ciphertext.length; offset += 16) {
                var stream = _aesEncryptBlock(counter, expanded);
                var blockLength = Math.min(16, ciphertext.length - offset);
                for (var blockIndex = 0; blockIndex < blockLength; blockIndex += 1) {
                    plain.push(ciphertext[offset + blockIndex] ^ stream[blockIndex]);
                }
                counter = _gcmIncrement(counter);
            }
            return _aesBase64Encode(plain);
        }
    };
})();



function _restoreLanercAlphabet(ciphertext) {
    return String(ciphertext || '')
        .replace(/1/g, '!')
        .replace(/5/g, '@')
        .replace(/9/g, '#')
        .replace(/\//g, '*')
        .replace(/-/g, '&')
        .replace(/!/g, '9')
        .replace(/@/g, '1')
        .replace(/#/g, '5')
        .replace(/\*/g, '+')
        .replace(/&/g, '/');
}



function _decryptApiData(ciphertext) {
    var config = _decryptOptions();
    var key = _firstValue(config, ['key']) || _LANERC_DECRYPT_KEY;
    try {
        var input = String(ciphertext || '');
        var inputFormat = String(config.input || 'base64');
        if (inputFormat === 'base64') {
            input = _restoreLanercAlphabet(input);
            while (input.length % 4) input += '=';
        }
        var options = {
            mode: String(config.mode || 'ECB'),
            padding: String(config.padding || 'PKCS5'),
            input: inputFormat,
            output: String(config.output || 'utf8')
        };
        if (config.iv !== null && config.iv !== undefined && config.iv !== '') {
            options.iv = String(config.iv);
        }
        if (config.keyFormat) options.keyFormat = String(config.keyFormat);
        if (config.ivFormat) options.ivFormat = String(config.ivFormat);
        var plain;
        if (typeof crypto !== 'undefined' && crypto.aes && typeof crypto.aes.decrypt === 'function') {
            plain = crypto.aes.decrypt(input, String(key), options);
        } else {
            if (options.mode !== 'ECB' || options.input !== 'base64' || options.output !== 'utf8') {
                throw new Error('内置 AES 仅支持 ECB、Base64 输入和 UTF-8 输出');
            }
            plain = _LANERC_AES_FALLBACK.decryptBase64(input, String(key));
        }
        var parsed = _safeParse(plain, null);
        if (!parsed || typeof parsed !== 'object') {
            _lanercLog('接口解密结果不是 JSON 对象');
            return null;
        }
        return parsed;
    } catch (error) {
        _lanercLog('接口 AES 解密失败：' + String(error));
        return null;
    }
}



function _decryptLanercStandardBase64(ciphertext, keyText) {
    var input = String(ciphertext || '').replace(/[\r\n\t ]/g, '');
    while (input.length % 4) input += '=';
    var key = String(keyText || '');
    if (!input || !key) return '';
    var nativeError = null;
    if (typeof crypto !== 'undefined' && crypto.aes && typeof crypto.aes.decrypt === 'function') {
        try {
            var nativePlain = crypto.aes.decrypt(input, key, {
                mode: 'ECB',
                padding: 'PKCS5',
                input: 'base64',
                output: 'utf8'
            });
            if (nativePlain !== null && nativePlain !== undefined && String(nativePlain) !== '') {
                return String(nativePlain);
            }
        } catch (error) {
            nativeError = error;
        }
    }
    try {
        return String(_LANERC_AES_FALLBACK.decryptBase64(input, key) || '');
    } catch (fallbackError) {
        if (nativeError) _lanercLog('动态配置 AES 解密失败：' + String(nativeError));
        return '';
    }
}



function _decodeApiResponse(value) {
    var response = value;
    if (!response || typeof response !== 'object' || _legacyIsArray(response)) return response;
    if (Number(response.code) === 201 && typeof response.data === 'string') {
        var decrypted = _decryptApiData(response.data);
        return decrypted || {};
    }
    return response;
}



function _isUsableApiResponse(value) {
    if (!value || typeof value !== 'object') return false;
    if (_legacyIsArray(value)) return value.length > 0;
    var code = value.code;
    if (typeof code === 'string' && /^-?\d+$/.test(_legacyTrim(code))) code = Number(code);
    if (typeof code === 'number' && (code < 0 || code >= 400)) return false;
    var status = value.status;
    if (typeof status === 'string' && /^-?\d+$/.test(_legacyTrim(status))) status = Number(status);
    if (typeof status === 'number' && status >= 400) return false;
    if (value.ok === false || value.error === true) return false;
    return Object.keys(value).length > 0;
}



function _lanercApiUserAgent() {
    var candidate = _legacyTrim(_lanercExt.userAgent);
    return /^Dart\//i.test(candidate) ? candidate : _LANERC_API_UA;
}



function _requestOptions(isPost, timeoutMs, url, extraHeaders, profile) {
    var guestJson = profile === 'guestJson';
    var userAgent = guestJson ? _LANERC_GUEST_JSON_UA : _lanercApiUserAgent();
    // 不写 Accept-Encoding。源站对详情 / 验证码会回 gzip；调用方自己带这个头时，
    // OkHttp 不再透明解压，JS 拿到的是压缩字节，详情解析失败、验证码图片也出不来。
    var headers = {
        'user-agent': userAgent,
        'content-type': guestJson ? _LANERC_GUEST_JSON_CONTENT_TYPE : _LANERC_JSON_CONTENT_TYPE
    };
    var requestUrl = String(url || '');
    if (_lanercIsDirectApiUrl(requestUrl)) {
        headers.host = _LANERC_DIRECT_HOST;
    }
    var supplied = extraHeaders && typeof extraHeaders === 'object' ? extraHeaders : {};
    for (var suppliedName in supplied) {
        if (_legacyOwn(supplied, suppliedName) && supplied[suppliedName] !== null && supplied[suppliedName] !== undefined) {
            headers[String(suppliedName)] = String(supplied[suppliedName]);
        }
    }
    var options = { headers: headers, ua: userAgent };
    var timeout = Number(timeoutMs || _lanercExt.timeout || 0);
    if (timeout > 0 && isFinite(timeout)) options.timeout = timeout;
    return JSON.stringify(options);
}


function _lanercBinaryBytes(value) {
    if (value === null || value === undefined) return [];
    if (typeof value === 'string') {
        var textBytes = [];
        for (var textIndex = 0; textIndex < value.length; textIndex += 1) {
            textBytes.push(value.charCodeAt(textIndex) & 0xff);
        }
        return textBytes;
    }
    if (typeof value === 'object' && typeof value.length === 'number') {
        var arrayBytes = [];
        for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex += 1) {
            arrayBytes.push(Number(value[arrayIndex]) & 0xff);
        }
        return arrayBytes;
    }
    return [];
}


function _lanercBytesToHex(bytes) {
    var output = '';
    for (var index = 0; index < bytes.length; index += 1) {
        var value = Number(bytes[index]) & 0xff;
        output += (value < 16 ? '0' : '') + value.toString(16);
    }
    return output;
}


function _lanercHexToBytes(value) {
    var text = String(value || '').replace(/[^0-9a-f]/gi, '');
    if (text.length % 2) text = '0' + text;
    var output = [];
    for (var index = 0; index < text.length; index += 2) output.push(parseInt(text.substr(index, 2), 16));
    return output;
}


function _lanercBytesToBase64(bytes) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var output = '';
    for (var index = 0; index < bytes.length; index += 3) {
        var first = Number(bytes[index]) & 0xff;
        var hasSecond = index + 1 < bytes.length;
        var hasThird = index + 2 < bytes.length;
        var second = hasSecond ? Number(bytes[index + 1]) & 0xff : 0;
        var third = hasThird ? Number(bytes[index + 2]) & 0xff : 0;
        output += alphabet.charAt(first >> 2);
        output += alphabet.charAt(((first & 3) << 4) | (second >> 4));
        output += hasSecond ? alphabet.charAt(((second & 15) << 2) | (third >> 6)) : '=';
        output += hasThird ? alphabet.charAt(third & 63) : '=';
    }
    return output;
}


function _lanercBase64ToBytes(value) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var input = String(value || '').replace(/[^A-Za-z0-9+/=]/g, '');
    var output = [];
    for (var index = 0; index < input.length; index += 4) {
        var first = alphabet.indexOf(input.charAt(index));
        var second = alphabet.indexOf(input.charAt(index + 1));
        if (first < 0 || second < 0) continue;
        var thirdChar = input.charAt(index + 2);
        var fourthChar = input.charAt(index + 3);
        var third = thirdChar === '=' || thirdChar === '' ? -1 : alphabet.indexOf(thirdChar);
        var fourth = fourthChar === '=' || fourthChar === '' ? -1 : alphabet.indexOf(fourthChar);
        output.push(((first << 2) | (second >> 4)) & 0xff);
        if (third >= 0) output.push((((second & 15) << 4) | (third >> 2)) & 0xff);
        if (fourth >= 0) output.push((((third & 3) << 6) | fourth) & 0xff);
    }
    return output;
}


function _lanercUtf8Decode(bytes) {
    var output = '';
    var index = 0;
    while (index < bytes.length) {
        var first = Number(bytes[index++]) & 0xff;
        if (first < 0x80) {
            output += String.fromCharCode(first);
        } else if (first < 0xe0 && index < bytes.length) {
            output += String.fromCharCode(((first & 0x1f) << 6) | (bytes[index++] & 0x3f));
        } else if (first < 0xf0 && index + 1 < bytes.length) {
            output += String.fromCharCode(
                ((first & 0x0f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f)
            );
        } else if (index + 2 < bytes.length) {
            var point = ((first & 7) << 18) | ((bytes[index++] & 0x3f) << 12) |
                ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f);
            point -= 0x10000;
            output += String.fromCharCode(0xd800 + (point >> 10), 0xdc00 + (point & 0x3ff));
        } else {
            output += '\ufffd';
        }
    }
    return output;
}


function _lanercProtoFields(value) {
    var bytes = _lanercBinaryBytes(value);
    var fields = {};
    var offset = 0;
    function readVarint() {
        var result = 0;
        var shift = 0;
        while (offset < bytes.length && shift < 56) {
            var current = bytes[offset++];
            result += (current & 0x7f) * Math.pow(2, shift);
            if ((current & 0x80) === 0) return result;
            shift += 7;
        }
        throw new Error('protobuf varint 非法');
    }
    while (offset < bytes.length) {
        var tag = readVarint();
        var fieldNumber = Math.floor(tag / 8);
        var wireType = tag & 7;
        if (!fieldNumber) throw new Error('protobuf field number 非法');
        var fieldValue;
        if (wireType === 0) {
            fieldValue = readVarint();
        } else if (wireType === 1) {
            if (offset + 8 > bytes.length) throw new Error('protobuf fixed64 截断');
            fieldValue = bytes.slice(offset, offset + 8);
            offset += 8;
        } else if (wireType === 2) {
            var length = readVarint();
            if (length < 0 || offset + length > bytes.length) throw new Error('protobuf length 截断');
            fieldValue = bytes.slice(offset, offset + length);
            offset += length;
        } else if (wireType === 5) {
            if (offset + 4 > bytes.length) throw new Error('protobuf fixed32 截断');
            fieldValue = bytes.slice(offset, offset + 4);
            offset += 4;
        } else {
            throw new Error('protobuf wire type 不支持：' + wireType);
        }
        if (!fields[fieldNumber]) fields[fieldNumber] = [];
        fields[fieldNumber].push({ wireType: wireType, value: fieldValue });
    }
    return fields;
}


function _lanercBinaryRequestOptions(url, timeoutMs, extraHeaders) {
    var options = _safeParse(_requestOptions(true, timeoutMs, url, {
        accept: 'application/x-protobuf'
    }), {});
    options.charset = 'ISO-8859-1';
    if (!options.headers) options.headers = {};
    options.headers.accept = 'application/x-protobuf';
    options.headers['content-type'] = _LANERC_JSON_CONTENT_TYPE;
    var extra = extraHeaders && typeof extraHeaders === 'object' ? extraHeaders : {};
    for (var extraName in extra) {
        if (_legacyOwn(extra, extraName) && extra[extraName]) {
            options.headers[extraName] = String(extra[extraName]);
        }
    }
    return options;
}


function _postLanercProtobuf(url, body, extraHeaders) {
    var primaryUrl = String(url || '');
    var payload = JSON.stringify(body || {});
    var timeout = Number(_lanercExt.timeout || 12000);
    var useHttpPost2 = typeof http !== 'undefined' && http && typeof http.post2 === 'function';
    function usablePayload(value) {
        if (_lanercBinaryBytes(value).length < 1) return false;
        try {
            return !!_playUrlFromProtobufResponse(value);
        } catch (error) {
            return false;
        }
    }
    function send(target) {
        var options = _lanercBinaryRequestOptions(target, timeout, extraHeaders);
        if (useHttpPost2) {
            var response = http.post2(target, payload, JSON.stringify(options));
            if (response && typeof response === 'object' && response.body !== undefined) {
                var status = Number(response.status || 0);
                if (status >= 400) return null;
                return response.body;
            }
            return response;
        }
        if (typeof post !== 'function') return null;
        return post(target, payload, JSON.stringify(options));
    }
    try {
        var primary = send(primaryUrl);
        if (usablePayload(primary)) return primary;
        if (_lanercBinaryBytes(primary).length > 0) {
            _lanercLog('x4x 主节点返回非 protobuf 内容，准备尝试直连节点');
        }
    } catch (error) {
        _lanercLog('x4x 主节点失败：' + primaryUrl + '；' + String(error));
    }
    var directUrl = _lanercAllowHttpFallback() ? _lanercDirectUrl(primaryUrl) : '';
    if (directUrl && directUrl !== primaryUrl) {
        try {
            var direct = send(directUrl);
            if (usablePayload(direct)) {
                _lanercLog('x4x 自动切换直连节点：' + directUrl);
                _lanercDirectUsed = true;
                return direct;
            }
            if (_lanercBinaryBytes(direct).length > 0) {
                _lanercLog('x4x 直连节点返回非 protobuf 内容');
            }
        } catch (directError) {
            _lanercLog('x4x 直连节点失败：' + directUrl + '；' + String(directError));
        }
    }
    return null;
}


function _lanercUserAccessToken() {
    if (typeof getItem !== 'function') return '';
    var raw = '';
    try {
        raw = getItem(_LANERC_USER_TOKEN_STORAGE_KEY, '') || '';
    } catch (error) {
        return '';
    }
    var saved = _safeParse(raw, null);
    if (typeof saved === 'string') return _legacyTrim(saved);
    if (!saved || typeof saved !== 'object' || _legacyIsArray(saved)) return '';
    return _legacyTrim(_firstValue(saved, ['accessToken', 'access_token', 'token']));
}



function _lanercPlayAuthHeaders() {
    var token = _lanercUserAccessToken();
    if (!token) return null;
    return { Authorization: 'Bearer ' + token };
}



function _postLanercV2Play(resourceId) {
    return _postLanercProtobuf(_resolveHost() + _LANERC_V2_PLAY_PATH, {
        resource_id: String(resourceId || '')
    }, _lanercPlayAuthHeaders());
}


function _lanercCaptchaImage(value) {
    var image = _legacyTrim(value).replace(/[\r\n\t ]/g, '');
    if (!image) return '';
    if (/^data:image\/png;base64,/i.test(image)) return image;
    var marker = image.indexOf('base64,');
    if (marker !== -1) image = image.slice(marker + 7);
    if (image.indexOf('iVBORw0KGgo') === 0) return 'data:image/png;base64,' + image;
    return '';
}



function _lanercNowSec() {
    return Math.floor(Number(timestamp()) / 1000);
}



function _lanercReadCaptchaCache() {
    if (typeof getItem !== 'function') return null;
    var raw = '';
    try {
        raw = getItem(_LANERC_GUEST_CAPTCHA_CACHE_KEY, '') || '';
    } catch (error) {
        return null;
    }
    var saved = _safeParse(raw, null);
    if (!saved || typeof saved !== 'object' || _legacyIsArray(saved)) return null;
    var challengeId = _legacyTrim(saved.challengeId);
    var image = _lanercCaptchaImage(saved.image);
    var optionCount = Math.floor(Number(saved.optionCount || 0));
    var expiresAt = Number(saved.expiresAt || 0);
    var now = _lanercNowSec();
    if (!challengeId || !image || optionCount < 1 || optionCount > 12) return null;
    if (!expiresAt || expiresAt <= now + 20) return null;
    return {
        ok: true,
        challengeId: challengeId,
        image: image,
        optionCount: optionCount,
        expiresIn: Math.max(1, Math.floor(expiresAt - now))
    };
}



function _lanercWriteCaptchaCache(challengeId, image, optionCount, expiresIn) {
    if (typeof setItem !== 'function') return;
    var ttl = Math.floor(Number(expiresIn || 180));
    if (!isFinite(ttl) || ttl < 30) ttl = 180;
    try {
        setItem(_LANERC_GUEST_CAPTCHA_CACHE_KEY, JSON.stringify({
            challengeId: challengeId,
            image: image,
            optionCount: optionCount,
            expiresAt: _lanercNowSec() + ttl
        }), String(ttl));
    } catch (error) {
    }
}



function _lanercClearCaptchaCache() {
    if (typeof removeItem !== 'function') return;
    try { removeItem(_LANERC_GUEST_CAPTCHA_CACHE_KEY); } catch (error) {}
}



function _lanercCaptchaLocked() {
    if (typeof getItem !== 'function') return false;
    var until = 0;
    try { until = Number(getItem(_LANERC_GUEST_CAPTCHA_LOCK_KEY, '0') || 0); } catch (error) { return false; }
    return isFinite(until) && until > _lanercNowSec();
}



function _lanercLockCaptcha() {
    if (typeof setItem !== 'function') return;
    try { setItem(_LANERC_GUEST_CAPTCHA_LOCK_KEY, String(_lanercNowSec() + 15), '15'); } catch (error) {}
}



function _lanercUnlockCaptcha() {
    if (typeof removeItem !== 'function') return;
    try { removeItem(_LANERC_GUEST_CAPTCHA_LOCK_KEY); } catch (error) {}
}



function _lanercWaitCaptchaCache() {
    var spins = 0;
    while (spins < 20) {
        var cached = _lanercReadCaptchaCache();
        if (cached) return cached;
        var start = Number(timestamp());
        while (Number(timestamp()) - start < 100) {}
        spins += 1;
    }
    return null;
}



function _lanercCaptchaPayload(raw) {
    if (raw && Number(raw.code) === 429) return null;
    var response = _payload(raw);
    var challengeId = _legacyTrim(_firstValue(response, ['challenge_id', 'challengeId']));
    var image = _lanercCaptchaImage(_firstValue(response, ['image', 'captcha', 'image_data', 'imageData']));
    var optionCount = Math.floor(Number(_firstValue(response, ['option_count', 'optionCount']) || 0));
    var expiresIn = Math.floor(Number(_firstValue(response, ['expires_in', 'expiresIn']) || 0));
    if (!challengeId || !image || optionCount < 1 || optionCount > 12) {
        return {
            ok: false,
            error: _legacyTrim(_firstValue(response, ['msg', 'message'])) || '验证码获取失败，请稍后重试'
        };
    }
    if (expiresIn <= 0) expiresIn = 180;
    _lanercWriteCaptchaCache(challengeId, image, optionCount, expiresIn);
    return {
        ok: true,
        challengeId: challengeId,
        image: image,
        optionCount: optionCount,
        expiresIn: expiresIn
    };
}



function guestCaptcha() {
    try {
        // 源站对这个接口限得很死：成功一次后马上再请求就是 429，而且越撞等待越长。
        // 弹窗被热开屏拆掉重挂时会再要一次，这里直接交还没过期的那张。
        var cached = _lanercReadCaptchaCache();
        if (cached) return JSON.stringify(cached);
        if (_lanercCaptchaLocked()) {
            var waited = _lanercWaitCaptchaCache();
            if (waited) return JSON.stringify(waited);
        }
        _lanercLockCaptcha();
        try {
            var raw = _apiPost(_LANERC_GUEST_CAPTCHA_PATH, {});
            if (raw && Number(raw.code) === 429) {
                var recovered = _lanercWaitCaptchaCache();
                if (recovered) return JSON.stringify(recovered);
                return JSON.stringify({
                    ok: false,
                    error: _legacyTrim(raw.msg) || '验证码请求过于频繁，请稍后再试'
                });
            }
            var parsed = _lanercCaptchaPayload(raw);
            if (!parsed) {
                return JSON.stringify({ ok: false, error: '验证码获取失败，请稍后重试' });
            }
            return JSON.stringify(parsed);
        } finally {
            _lanercUnlockCaptcha();
        }
    } catch (error) {
        _lanercUnlockCaptcha();
        var fallback = _lanercReadCaptchaCache();
        if (fallback) return JSON.stringify(fallback);
        return JSON.stringify({ ok: false, error: '验证码获取失败，请检查网络后重试' });
    }
}


function guestBind(challengeId, selected) {
    try {
        var challenge = _legacyTrim(challengeId);
        var choice = Number(selected);
        if (!challenge || !isFinite(choice) || Math.floor(choice) !== choice || choice < 1) {
            return JSON.stringify({ ok: false, error: '请选择正确的图片序号' });
        }
        var raw = _apiPost(_LANERC_GUEST_CREDENTIAL_PATH, {
            challenge_id: challenge,
            selected: String(choice)
        });
        var response = _payload(raw);
        var credential = _legacyTrim(_firstValue(response, ['credential', 'guest_credential', 'guestCredential']));
        var expiresAt = Math.floor(Number(_firstValue(response, ['expires_at', 'expiresAt']) || 0));
        if (!credential) {
            var code = Number(raw && raw.code);
            var message = _legacyTrim(_firstValue(response, ['msg', 'message', 'error']) ||
                _firstValue(raw, ['msg', 'message', 'error']));
            if (code === 429) {
                return JSON.stringify({ ok: false, error: message || '游客凭证请求次数已达上限，请稍后再试', code: code });
            }
            if (code >= 400 || message) _lanercClearCaptchaCache();
            return JSON.stringify({
                ok: false,
                error: message || (Object.keys(raw || {}).length
                    ? '验证失败或验证码已过期，请换一张重试'
                    : '验证服务无响应，请检查网络后重试'),
                code: code >= 400 ? code : undefined
            });
        }
        if (typeof setItem !== 'function') {
            return JSON.stringify({ ok: false, error: '当前客户端不支持保存设备凭证' });
        }
        _lanercClearCaptchaCache();
        setItem(_LANERC_GUEST_CREDENTIAL_STORAGE_KEY, JSON.stringify({
            credential: credential,
            expiresAt: expiresAt,
            origin: _resolveHost()
        }));
        return JSON.stringify({ ok: true, expiresAt: expiresAt });
    } catch (error) {
        return JSON.stringify({ ok: false, error: '绑定失败，请换一张验证码重试' });
    }
}


function login(account, password) {
    try {
        var mail = _legacyTrim(account);
        var pwd = password === null || password === undefined ? '' : String(password);
        if (!mail || !pwd) return JSON.stringify({ ok: false, error: '请输入账号和密码' });
        var raw = _apiPost('app/user/login', { account: mail, pwd: pwd });
        if (raw && typeof raw === 'object' && Number(raw.code) >= 400) {
            return JSON.stringify({ ok: false, error: _legacyTrim(raw.msg) || '登录失败' });
        }
        var token = _legacyTrim(_findDeepAny(raw, ['access_token', 'accessToken', 'token']));
        if (!token) token = _legacyTrim(_findDeepAny(_payload(raw), ['access_token', 'accessToken', 'token']));
        if (!token) {
            var message = _legacyTrim(_firstValue(raw, ['msg', 'message']));
            return JSON.stringify({ ok: false, error: message || '登录失败' });
        }
        if (typeof setItem !== 'function') {
            return JSON.stringify({ ok: false, error: '当前客户端不支持保存登录状态' });
        }
        var refresh = _legacyTrim(_findDeepAny(raw, ['refresh_token', 'refreshToken']));
        setItem(_LANERC_USER_TOKEN_STORAGE_KEY, JSON.stringify({
            accessToken: token,
            refreshToken: refresh
        }));
        return JSON.stringify({ ok: true });
    } catch (error) {
        return JSON.stringify({ ok: false, error: '登录失败，请检查网络后重试' });
    }
}


function _lanercGuestCredentialRecord(flagData) {
    var flag = flagData && typeof flagData === 'object' ? flagData : {};
    var supplied = _firstValue(flag, ['guestCredential', 'guest_credential', 'guestCredentialRecord']);
    var shouldPersist = supplied !== '';
    if (supplied === '') {
        supplied = _firstValue(_lanercExt, ['guestCredential', 'guest_credential', 'guestCredentialRecord']);
        shouldPersist = supplied !== '';
    }
    if (supplied === '' && typeof getItem === 'function') {
        try {
            supplied = getItem(_LANERC_GUEST_CREDENTIAL_STORAGE_KEY, '') || '';
        } catch (storageReadError) {
            supplied = '';
        }
    }
    if (typeof supplied === 'string') {
        var decoded = _safeParse(supplied, null);
        if (decoded && typeof decoded === 'object' && !_legacyIsArray(decoded)) supplied = decoded;
    }
    var record = supplied && typeof supplied === 'object' && !_legacyIsArray(supplied) ? supplied : {};
    var credential = typeof supplied === 'string' ? _legacyTrim(supplied) : _legacyTrim(
        _firstValue(record, ['credential', 'guestCredential', 'guest_credential'])
    );
    var expiresAt = Number(_firstValue(record, ['expiresAt', 'expires_at', 'expiry', 'expires']) || 0);
    var originValue = _legacyTrim(_firstValue(record, ['origin', 'host']));
    var origin = '';
    if (originValue && /^https?:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(originValue)) {
        origin = _normalizeHost(originValue);
    }
    var now = Math.floor(Number(timestamp()) / 1000);
    var error = '';
    if (credential && expiresAt > 0 && expiresAt <= now) {
        error = '游客设备凭证已过期，请在自己的设备重新完成官方 App 游客验证';
    }
    if (shouldPersist && credential && !error && typeof setItem === 'function') {
        try {
            setItem(_LANERC_GUEST_CREDENTIAL_STORAGE_KEY, JSON.stringify({
                credential: credential,
                expiresAt: expiresAt,
                origin: origin
            }));
        } catch (storageWriteError) {
        }
    }
    return {
        credential: credential,
        expiresAt: expiresAt,
        origin: origin,
        error: error
    };
}


function _postLanercGuestPlay(resourceId, record) {
    var credential = record && record.credential ? String(record.credential) : '';
    if (!credential) return null;
    var host = record && record.origin ? record.origin : _resolveHost();
    return _postLanercProtobuf(host + _LANERC_GUEST_PLAY_PATH, {
        resource_id: String(resourceId || ''),
        guest_credential: credential
    });
}


function _decryptLanercPlayPayload(payload) {
    var bytes = _lanercBinaryBytes(payload);
    if (bytes.length < 12 + 16) throw new Error('x4x 密文长度非法：' + bytes.length);
    var nonce = bytes.slice(0, 12);
    var ciphertextAndTag = bytes.slice(12);
    var ciphertextBase64 = _lanercBytesToBase64(ciphertextAndTag);
    var nonceHex = _lanercBytesToHex(nonce);
    var plainBase64 = '';
    if (typeof crypto !== 'undefined' && crypto.aes && typeof crypto.aes.decrypt === 'function') {
        try {
            plainBase64 = crypto.aes.decrypt(ciphertextBase64, _LANERC_PLAY_RESOLVE_KEY_HEX, {
                mode: 'GCM',
                padding: 'NoPadding',
                keyFormat: 'hex',
                input: 'base64',
                output: 'base64',
                iv: nonceHex,
                ivFormat: 'hex'
            });
        } catch (nativeCryptoError) {
            _lanercLog('运行器 AES-GCM 失败，切换内置实现：' + String(nativeCryptoError));
        }
    }
    if (!plainBase64) {
        plainBase64 = _LANERC_AES_FALLBACK.decryptGcmBase64(
            ciphertextBase64, _LANERC_PLAY_RESOLVE_KEY_HEX, _lanercBytesToBase64(nonce)
        );
    }
    var plainBytes = _lanercBinaryBytes(plainBase64);
    if (typeof plainBase64 === 'string') plainBytes = _lanercBase64ToBytes(plainBase64);
    if (!plainBytes.length) throw new Error('x4x 明文为空');
    return plainBytes;
}


function _playUrlFromProtobufResponse(response) {
    var envelope = _lanercProtoFields(response);
    var encryptedField = envelope[4] && envelope[4][0];
    if (!encryptedField || encryptedField.wireType !== 2) return '';
    var plain = _decryptLanercPlayPayload(encryptedField.value);
    var resolved = _lanercProtoFields(plain);
    var urlField = resolved[1] && resolved[1][0];
    if (!urlField || urlField.wireType !== 2) return '';
    return _normalizePlayText(_lanercUtf8Decode(urlField.value));
}



function _requestJson(url, timeoutMs) {
    var primaryUrl = String(url || '');
    try {
        var primary = _decodeApiResponse(_safeParse(request(primaryUrl, _requestOptions(false, timeoutMs, primaryUrl)), {}));
        if (_isUsableApiResponse(primary)) {
            _lanercDirectUsed = false;
            return primary;
        }
    } catch (error) {
        _lanercLog('GET失败：' + primaryUrl + '；' + String(error));
    }
    var directUrl = _lanercAllowHttpFallback() ? _lanercDirectUrl(primaryUrl) : '';
    if (directUrl && directUrl !== primaryUrl) {
        try {
            var direct = _decodeApiResponse(_safeParse(request(directUrl, _requestOptions(false, timeoutMs, directUrl)), {}));
            if (_isUsableApiResponse(direct)) {
                _lanercLog('GET 自动切换直连节点：' + directUrl);
                _lanercDirectUsed = true;
                return direct;
            }
        } catch (directError) {
            _lanercLog('GET 直连节点失败：' + directUrl + '；' + String(directError));
        }
    }
    return {};
}



function _postJson(url, body, profile) {
    var primaryUrl = String(url || '');
    var payload = JSON.stringify(body || {});
    try {
        var primary = _decodeApiResponse(_safeParse(post(primaryUrl, payload, _requestOptions(true, 0, primaryUrl, null, profile)), {}));
        if (_isUsableApiResponse(primary)) {
            _lanercDirectUsed = false;
            return primary;
        }
        if (primary && typeof primary === 'object' && !_legacyIsArray(primary) && Number(primary.code) >= 400) {
            return primary;
        }
    } catch (error) {
        _lanercLog('POST失败：' + primaryUrl + '；' + String(error));
    }
    var directUrl = _lanercAllowHttpFallback() ? _lanercDirectUrl(primaryUrl) : '';
    if (directUrl && directUrl !== primaryUrl) {
        try {
            var direct = _decodeApiResponse(_safeParse(post(directUrl, payload, _requestOptions(true, 0, directUrl, null, profile)), {}));
            if (_isUsableApiResponse(direct)) {
                _lanercLog('POST 自动切换直连节点：' + directUrl);
                _lanercDirectUsed = true;
                return direct;
            }
        } catch (directError) {
            _lanercLog('POST 直连节点失败：' + directUrl + '；' + String(directError));
        }
    }
    return {};
}



function _lanercDirectUrl(url) {
    var value = String(url || '');
    var directHostUrl = _lanercDirectHostUrl();
    if (!directHostUrl) return '';
    var hostPattern = new RegExp('^https?://' + _LANERC_DIRECT_HOST.replace(/\./g, '\\.') + '(?=/|$)', 'i');
    if (!hostPattern.test(value)) return '';
    return value.replace(hostPattern, directHostUrl.slice(0, -1));
}



function _findDeep(value, key, depth) {
    var level = depth || 0;
    if (!value || typeof value !== 'object' || level > 12) return '';
    if (_legacyOwn(value, key)) return value[key];
    for (var name in value) {
        if (!_legacyOwn(value, name)) continue;
        var found = _findDeep(value[name], key, level + 1);
        if (found !== '' && found !== null && found !== undefined) return found;
    }
    return '';
}



function _findDeepAny(value, keys) {
    var names = _legacyIsArray(keys) ? keys : [];
    for (var index = 0; index < names.length; index += 1) {
        var found = _findDeep(value, String(names[index] || ''));
        if (found !== '' && found !== null && found !== undefined) return found;
    }
    return '';
}



function _normalizePlayText(value) {
    var text = _legacyTrim(value);
    if (!text) return '';
    text = text
        .replace(/\\\//g, '/')
        .replace(/\\u0026/gi, '&')
        .replace(/&amp;/gi, '&');
    if (/^https?%3a%2f%2f/i.test(text)) {
        try { text = decodeUri(text); } catch (error) { }
    }
    if (/^\/\//.test(text)) text = 'https:' + text;
    return text;
}



function _playUrlFromResponse(response) {
    var source = response;
    if (typeof source === 'string') {
        var parsedSource = _safeParse(source, source);
        if (parsedSource === source) return _normalizePlayText(source);
        source = parsedSource;
    }
    for (var depth = 0; depth < 3 && source && typeof source === 'object'; depth += 1) {
        if (typeof source.data !== 'string') break;
        var decoded = _safeParse(source.data, null);
        if (!decoded || typeof decoded !== 'object') break;
        source = decoded;
    }
    var value = _findDeepAny(source, [
        'play_url', 'playUrl', 'playurl', 'video_url', 'videoUrl',
        'm3u8_url', 'm3u8Url', 'url', 'src'
    ]);
    if (value && typeof value === 'object') {
        value = _findDeepAny(value, ['url', 'play_url', 'playUrl', 'src', 'value']);
    }
    return _normalizePlayText(value);
}



function _playHeadersFromResponse(response) {
    var source = response;
    if (typeof source === 'string') source = _safeParse(source, source);
    for (var depth = 0; depth < 3 && source && typeof source === 'object'; depth += 1) {
        if (typeof source.data !== 'string') break;
        var decoded = _safeParse(source.data, null);
        if (!decoded || typeof decoded !== 'object') break;
        source = decoded;
    }
    var value = _findDeepAny(source, [
        'play_header', 'playHeader', 'play_headers', 'playHeaders',
        'http_headers', 'httpHeaders', 'headers'
    ]);
    if (typeof value === 'string') value = _safeParse(value, null);
    if (!value || typeof value !== 'object' || _legacyIsArray(value)) return {};
    var result = {};
    for (var key in value) {
        if (_legacyOwn(value, key) && value[key] !== null && value[key] !== undefined) {
            result[String(key)] = String(value[key]);
        }
    }
    return result;
}



function _playResult(response, playUrl) {
    var result = { url: playUrl, type: _mediaType(playUrl) };
    var headers = _playHeadersFromResponse(response);
    var source = response;
    if (typeof source === 'string') source = _safeParse(source, source);
    if (result.type === 'auto') {
        var responseType = String(_findDeepAny(source, ['type', 'format', 'mime', 'mime_type']) || '').toLowerCase();
        if (responseType.indexOf('m3u8') !== -1 || responseType.indexOf('hls') !== -1) result.type = 'm3u8';
        else if (responseType.indexOf('mp4') !== -1) result.type = 'mp4';
    }
    var referer = _normalizePlayText(_findDeepAny(source, ['referer', 'referrer']));
    var userAgent = _normalizePlayText(_findDeepAny(source, ['user_agent', 'userAgent', 'ua']));

    if (Object.keys(headers).length) result.headers = headers;
    if (referer) result.referer = referer;
    if (userAgent) result.userAgent = userAgent;
    return result;
}



function _lanercStringList(value, fallback) {
    var source = value;
    if (typeof source === 'string') {
        var parsed = _safeParse(source, null);
        if (_legacyIsArray(parsed)) source = parsed;
        else source = String(source).split(',');
    }
    if (!_legacyIsArray(source)) source = fallback || [];
    var result = [];
    for (var index = 0; index < source.length; index += 1) {
        var item = _legacyTrim(source[index]);
        if (item) result.push(item);
    }
    return result;
}



function _lanercDiscoveryMode() {
    var mode = _legacyTrim(_lanercExt.discoveryMode).toLowerCase();
    if (mode === 'dynamic' || mode === 'fixed' || mode === 'auto') return mode;
    if (_lanercExt.dynamicDiscovery !== null && _lanercExt.dynamicDiscovery !== undefined &&
        _lanercExt.dynamicDiscovery !== '') {
        return _lanercBoolean(_lanercExt.dynamicDiscovery, true) ? 'dynamic' : 'fixed';
    }
    return 'auto';
}



function _lanercRandomToken(length) {
    var fixed = _legacyTrim(_lanercExt.discoveryPrefix);
    if (fixed) return fixed.replace(/[^a-z0-9]/gi, '').toLowerCase();
    var size = Number(length || _lanercExt.discoveryPrefixLength || 6);
    if (!isFinite(size) || size < 4 || size > 16) size = 6;
    var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    while (result.length < size) {
        result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return result;
}



function _lanercRawJsonGet(url, timeoutMs, extraHeaders) {
    var target = String(url || '');
    try {
        var raw = request(target, _requestOptions(false, timeoutMs, target, extraHeaders));
        var parsed = _safeParse(raw, null);
        if (!parsed || typeof parsed !== 'object') return {};
        return _decodeApiResponse(parsed);
    } catch (error) {
        _lanercLog('动态配置请求失败：' + target + '；' + String(error));
        return {};
    }
}



function _lanercDiscoveryUrls() {
    var supplied = _lanercStringList(_lanercExt.configUrl || _lanercExt.discoveryUrls, []);
    if (supplied.length) return supplied;
    var prefix = _lanercRandomToken();
    var domain = _legacyTrim(_lanercExt.discoveryDomain) || _LANERC_DISCOVERY_DOMAIN;
    var path = (_legacyTrim(_lanercExt.discoveryPath) || _LANERC_DISCOVERY_PATH).replace(/^\/+/, '');
    return [
        'https://' + prefix + '.' + domain + '/' + path,
        'http://' + prefix + '.' + domain + '/' + path,
        _LANERC_DISCOVERY
    ];
}



function _lanercConfigHost(value) {
    var source = value;
    if (typeof source === 'string') {
        var parsed = _safeParse(source, source);
        source = parsed;
    }
    var candidate = typeof source === 'string' ? source : _findDeepAny(source, [
        'domain', 'host', 'api', 'apiHost', 'baseUrl', 'base_url'
    ]);
    var host = _normalizeDiscoveredHost(candidate);
    if (_isStaleLanercHost(host)) return '';
    return host;
}



function _lanercDnsTxtData(response) {
    var answers = response && typeof response === 'object' ? _findDeep(response, 'Answer') : null;
    if (!answers) return '';
    if (!_legacyIsArray(answers)) answers = [answers];
    for (var index = 0; index < answers.length; index += 1) {
        var answer = answers[index];
        var data = answer && typeof answer === 'object' ? answer.data : answer;
        var text = _legacyTrim(data);
        if (!text) continue;
        text = text
            .replace(/^['"]+|['"]+$/g, '')
            .replace(/"\s+"/g, '')
            .replace(/\\"/g, '"')
            .replace(/[^A-Za-z0-9+\/=]/g, '');
        if (text) return text;
    }
    return '';
}



function _discoverLanercDnsHost() {
    var names = _lanercStringList(_lanercExt.dohNames, _LANERC_DOH_NAMES);
    var resolvers = _lanercStringList(_lanercExt.dohResolvers, _LANERC_DOH_RESOLVERS);
    var key = _legacyTrim(_lanercExt.dohKey) || _LANERC_DOH_DECRYPT_KEY;
    var timeout = Number(_lanercExt.dohTimeout || Math.min(_LANERC_PROBE_TIMEOUT_MS, 2200));
    for (var resolverIndex = 0; resolverIndex < resolvers.length; resolverIndex += 1) {
        var base = String(resolvers[resolverIndex] || '').replace(/\/+$/, '') + '/';
        for (var nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
            var url = base + 'resolve?name=' + encodeUri(names[nameIndex]) + '&type=txt';
            var response = _lanercRawJsonGet(url, timeout, { Accept: 'application/dns-json' });
            var ciphertext = _lanercDnsTxtData(response);
            if (!ciphertext) continue;
            var plain = _decryptLanercStandardBase64(ciphertext, key);
            var host = _normalizeDiscoveredHost(plain);
            if (host && !_isStaleLanercHost(host)) {
                _lanercLog('DNS TXT 已恢复 API 地址：' + host);
                return host;
            }
        }
    }
    return '';
}



function _discoverLanercHost() {
    /* 当前官方发现链是加密 DNS TXT；优先走它，避免先等待已销毁的 COS/随机子域。 */
    var dnsHost = _discoverLanercDnsHost();
    if (dnsHost) return dnsHost;
    var urls = _lanercDiscoveryUrls();
    for (var index = 0; index < urls.length; index += 1) {
        var discovery = _lanercRawJsonGet(urls[index], _LANERC_PROBE_TIMEOUT_MS, {
            Accept: 'application/json'
        });
        var host = _lanercConfigHost(discovery);
        if (host) {
            _lanercLog('在线配置已发现 API 地址：' + host);
            return host;
        }
    }
    return '';
}



function _lanercHealthPath(seconds) {
    var timeValue = seconds === null || seconds === undefined
        ? Math.floor(Number(timestamp()) / 1000)
        : Math.floor(Number(seconds));
    var secret = _legacyTrim(_lanercExt.healthSecret) || _LANERC_HEALTH_SECRET;
    var digest = md5('/app/health@' + timeValue + '@' + secret);
    return 'app/health?sign=' + encodeUri(String(digest).toLowerCase());
}



function _lanercHealthOk(value) {
    var data = _payload(value);
    if (!data || typeof data !== 'object') return false;
    if (data.status === true || String(data.status).toLowerCase() === 'true') return true;
    if (data.ok === true || data.success === true) return true;
    var code = Number(data.code);
    return isFinite(code) && (code === 0 || code === 200);
}



function _lanercHostCandidates(host) {
    var normalized = _normalizeDiscoveredHost(host);
    if (!normalized) return [];
    var result = [];
    if (/^http:\/\//i.test(normalized)) {
        result.push(normalized.replace(/^http:/i, 'https:'));
        if (_lanercAllowHttpFallback()) result.push(normalized);
    } else {
        result.push(normalized);
        if (_lanercAllowHttpFallback()) result.push(normalized.replace(/^https:/i, 'http:'));
    }
    return result;
}



function _probeLanercHost(host) {
    var candidates = _lanercHostCandidates(host);
    for (var index = 0; index < candidates.length; index += 1) {
        var candidate = candidates[index];
        _lanercDirectUsed = false;
        var health = _requestJson(candidate + _lanercHealthPath(), _LANERC_PROBE_TIMEOUT_MS);
        if (_lanercHealthOk(health)) {
            return _lanercDirectUsed ? _lanercDirectHostUrl() : candidate;
        }
        var home = _payload(_requestJson(candidate + 'app/home', _LANERC_PROBE_TIMEOUT_MS));
        if (home && typeof home === 'object' &&
            (_legacyOwn(home, 'vod_list') || _legacyOwn(home, 'banner') || _legacyOwn(home, 'hot_list'))) {
            _lanercHome = home;
            return _lanercDirectUsed ? _lanercDirectHostUrl() : candidate;
        }
    }
    return '';
}



function _resolveHost() {
    if (_lanercHost) return _lanercHost;
    var discoveryMode = _lanercDiscoveryMode();
    _lanercHost = _normalizeHost(_lanercExt.host);
    if (_isLegacyLanercIpHost(_lanercHost) &&
        !_legacyTrim(_lanercExt.apiIp || _lanercExt.directIp)) {
        _lanercLog('忽略旧版 ext.host 直连 IP，改走官方 DNS TXT 发现链');
        _lanercHost = '';
    }
    if (_lanercHost && !_isStaleLanercHost(_lanercHost) && discoveryMode !== 'dynamic') return _lanercHost;
    if (_lanercHost) {
        _lanercLog((discoveryMode === 'dynamic' ? 'dynamic 模式忽略 ext.host：' :
            '运行器传入旧域名，忽略 ext.host：') + _lanercHost);
        _lanercHost = '';
    }
    if (discoveryMode !== 'fixed') {
        var discoveredHost = _probeLanercHost(_discoverLanercHost());
        if (discoveredHost) {
            _lanercHost = discoveredHost;
            return _lanercHost;
        }
    }

    var fallbackUrl = _LANERC_FALLBACK_HOST + 'app/home';
    var fallbackProbe = _payload(_requestJson(fallbackUrl, _LANERC_PROBE_TIMEOUT_MS));
    if (fallbackProbe && typeof fallbackProbe === 'object' &&
        (_legacyOwn(fallbackProbe, 'vod_list') || _legacyOwn(fallbackProbe, 'banner') || _legacyOwn(fallbackProbe, 'hot_list'))) {
        _lanercHome = fallbackProbe;
        _lanercHost = (_lanercAllowHttpFallback() && _lanercDirectUsed)
            ? _lanercDirectHostUrl() : _LANERC_FALLBACK_HOST;
        return _lanercHost;
    }

    var directHostUrl = _lanercDirectHostUrl();
    if (_lanercAllowHttpFallback() && directHostUrl) {
        var directProbe = _payload(_requestJson(directHostUrl + 'app/home', _LANERC_PROBE_TIMEOUT_MS));
        if (directProbe && typeof directProbe === 'object' &&
            (_legacyOwn(directProbe, 'vod_list') || _legacyOwn(directProbe, 'banner') || _legacyOwn(directProbe, 'hot_list'))) {
            _lanercHome = directProbe;
            _lanercHost = directHostUrl;
            _lanercLog('已切换显式兼容直连 API 节点：' + _lanercHost);
            return _lanercHost;
        }
    }

    if (!_lanercHost) {
        _lanercLog('域名发现失败，使用静态回退地址');
        _lanercHost = _LANERC_FALLBACK_HOST;
    }
    return _lanercHost;
}



function _apiGet(path) {
    return _requestJson(_resolveHost() + String(path || '').replace(/^\/+/, ''));
}



// 对 API 路径生成 sign。path 可以是纯路径，也可以已经带 query；签名摘要覆盖完整的
// path+query（不含 sign 本身），再用正确的 ? / & 分隔符追加 sign。
function _lanercSignedApiPath(path, seconds, nonce) {
    var cleanPath = String(path || '').replace(/^\/+/, '');
    var timeValue = seconds === null || seconds === undefined
        ? Math.floor(Number(timestamp()) / 1000)
        : Math.floor(Number(seconds));
    var randomValue = nonce === null || nonce === undefined ? '' : String(nonce);
    var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    while (randomValue.length < 6) {
        randomValue += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    randomValue = randomValue.slice(0, 6);
    var digest = md5('/' + cleanPath + '@' + timeValue + '@' + randomValue + '@' + _LANERC_QUERY_SIGN_SECRET);
    var sep = cleanPath.indexOf('?') >= 0 ? '&' : '?';
    return cleanPath + sep + 'sign=' + timeValue + '-' + randomValue + '-' + String(digest).toLowerCase();
}



function _apiPost(path, body) {
    var cleanPath = String(path || '').replace(/^\/+/, '');
    var signed = cleanPath === _LANERC_GUEST_CAPTCHA_PATH ||
        cleanPath === _LANERC_GUEST_CREDENTIAL_PATH;
    var requestPath = signed ? _lanercSignedApiPath(cleanPath) : cleanPath;
    return _postJson(_resolveHost() + requestPath, body, signed ? 'guestJson' : '');
}



function _payload(value) {
    var current = value;
    var count = 0;
    while (
        current &&
        typeof current === 'object' &&
        !_legacyIsArray(current) &&
        _legacyOwn(current, 'data') &&
        current.data !== null &&
        current.data !== undefined &&
        count < 4
    ) {
        current = current.data;
        count += 1;
    }
    return current || {};
}


var _LANERC_PIC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';



function _lanercCoverPic(pic) {
    var url = String(pic || '');
    if (!url) return '';
    if (url.indexOf('@Referer=') !== -1 || url.indexOf('@User-Agent=') !== -1 || url.indexOf('@Headers=') !== -1) return url;
    if (url.indexOf('doubanio.com') === -1) return url;
    return url + '@Referer=https://movie.douban.com/@User-Agent=' + _LANERC_PIC_UA;
}



function _firstValue(object, keys) {
    var source = object || {};
    for (var index = 0; index < keys.length; index += 1) {
        var value = source[keys[index]];
        if (value !== null && value !== undefined && value !== '') return value;
    }
    return '';
}



function _cardRemarks(source) {
    var text = _legacyTrim(String(_firstValue(source, ['vod_remarks', 'vod_sub', 'vod_tag']) || ''));
    var flag = text === '0' || text === '1' ? text : String(_firstValue(source, ['vod_isend']));
    if (text === '' || text === '0' || text === '1') {
        if (flag === '1') return '已完结';
        if (flag === '0') return '连载中';
        return '';
    }
    return text;
}

 
function _sortName(value) {
    var key = String(value === null || value === undefined ? '' : value);
    if (!key) return '';
    var home = _getHome();
    var groups = _legacyIsArray(home.vod_list) ? home.vod_list : [];
    for (var index = 0; index < groups.length; index += 1) {
        var group = groups[index] || {};
        if (String(group.sort_id) === key) return String(group.sort_name || '');
    }
    return '';
}



function _typeText(source) {
    var value = _firstValue(source || {}, ['vod_class', 'vod_type']);
    var text = _legacyTrim(String(value === null || value === undefined ? '' : value));
    if (!text) return '';
    if (/^\d+$/.test(text)) return _sortName(text);
    return text;
}



function _card(item, sectionTitle) {
    var source = item || {};
    var id = _firstValue(source, ['id', 'vod_id']);
    var name = _firstValue(source, ['vod_name', 'name', 'title']);
    if (id === '' || name === '') return null;
    return {
        id: String(id),
        name: String(name),
        pic: _lanercCoverPic(_firstValue(source, ['vod_pic', 'pic', 'image', 'cover'])),
        type: String(sectionTitle || '') || _typeText(source),
        year: String(_firstValue(source, ['vod_year', 'year']) || ''),
        remarks: _cardRemarks(source),
        desc: String(_firstValue(source, ['vod_blurb', 'desc']) || '')
    };
}



function _cards(items, sectionTitle) {
    var list = _legacyIsArray(items) ? items : [];
    var result = [];
    for (var index = 0; index < list.length; index += 1) {
        var item = _card(list[index], sectionTitle);
        if (item) result.push(item);
    }
    return result;
}



function _optionText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        return _legacyTrim(_firstValue(value, ['n', 'name', 'title', 'v', 'value']) || '');
    }
    return _legacyTrim(value);
}



function _options(value) {
    var source = value;
    if (typeof source === 'string') {
        var textValue = _legacyTrim(source);
        var parsed = _safeParse(textValue, null);
        source = _legacyIsArray(parsed) ? parsed : (textValue ? textValue.split(/[,/]/) : []);
    }
    if (!_legacyIsArray(source)) source = source === null || source === undefined || source === '' ? [] : [source];

    var result = ['全部'];
    var seen = { '全部': true };
    for (var index = 0; index < source.length; index += 1) {
        var option = _optionText(source[index]);
        if (!option || seen[option]) continue;
        seen[option] = true;
        result.push(option);
    }
    return result;
}



function _filterOptions(value) {
    var options = _options(value);
    var result = [];
    for (var index = 0; index < options.length; index += 1) {
        var name = String(options[index]);
        result.push({ n: name, v: name === '全部' ? '' : name });
    }
    return result;
}



function _getHome() {
    if (_lanercHome !== null) return _lanercHome;
    /* _resolveHost() 的健康探测可能已经拿到了完整首页，避免同一次冷启动重复请求。 */
    var host = _resolveHost();
    if (_lanercHome !== null) return _lanercHome;
    _lanercHome = _payload(_requestJson(host + 'app/home'));
    if (!_lanercHome || typeof _lanercHome !== 'object') _lanercHome = {};
    return _lanercHome;
}



function _buildHomeSections() {
    var home = _getHome();
    var sections = [];
    var banner = _cards(home.banner, '推荐');
    var hot = _cards(home.hot_list, '热门');
    if (banner.length) sections.push({ title: '轮播', key: '__hero__', items: banner });
    if (hot.length) sections.push({ title: '热门', key: '', items: hot });

    var vodList = _legacyIsArray(home.vod_list) ? home.vod_list : [];
    for (var index = 0; index < vodList.length; index += 1) {
        var group = vodList[index] || {};
        var title = String(group.sort_name || '分类');
        var key = String(group.sort_id === null || group.sort_id === undefined ? title : group.sort_id);
        var items = _cards(group.vods, title);
        if (items.length) sections.push({ title: title, key: key, items: items });
    }
    return sections;
}



function _flattenHome() {
    var sections = _buildHomeSections();
    var ordered = [];
    var index;
    for (index = 0; index < sections.length; index += 1) {
        if (sections[index].title === '热门') ordered.push(sections[index]);
    }
    for (index = 0; index < sections.length; index += 1) {
        if (sections[index].title !== '热门' && sections[index].key !== '__hero__') ordered.push(sections[index]);
    }
    for (index = 0; index < sections.length; index += 1) {
        if (sections[index].key === '__hero__') ordered.push(sections[index]);
    }

    var cards = [];
    var seen = {};
    for (index = 0; index < ordered.length; index += 1) {
        var items = ordered[index].items || [];
        for (var itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
            var item = items[itemIndex];
            if (seen[item.id]) continue;
            seen[item.id] = true;
            cards.push(item);
        }
    }
    return cards;
}



function homeSections() {
    try {
        return JSON.stringify(_buildHomeSections());
    } catch (error) {
        _lanercLog('首页分区转换失败：' + String(error));
        return '[]';
    }
}



function search(keyword, page) {
    try {
        var word = _legacyTrim(keyword);
        if (!word) return JSON.stringify(_flattenHome());
        if (_isCategoryKey(word)) return JSON.stringify(_filteredPage(word, {}, page || 1));
        var data = _payload(_apiGet('app/vod/search?keyword=' + encodeUri(word)));
        return JSON.stringify(_cards(data.search_vods, ''));
    } catch (error) {
        _lanercLog('搜索失败：' + String(error));
        return '[]';
    }
}



function categories() {
    try {
        var home = _getHome();
        var groups = _legacyIsArray(home.vod_list) ? home.vod_list : [];
        var result = [{ key: '', title: '推荐', name: '推荐' }];
        for (var index = 0; index < groups.length; index += 1) {
            var group = groups[index] || {};
            var title = String(group.sort_name || '分类');
            var key = String(group.sort_id === null || group.sort_id === undefined ? title : group.sort_id);
            result.push({
                key: key,
                title: title,
                name: title,
                filters: [
                    { key: 'class', name: '', value: _filterOptions(group.type_class) },
                    { key: 'year', name: '', value: _filterOptions(group.type_year) },
                    {
                        key: 'sort',
                        name: '',
                        value: [{ n: '按时间', v: '' }, { n: '按评分', v: 'vod_score' }]
                    }
                ]
            });
        }
        return JSON.stringify(result);
    } catch (error) {
        _lanercLog('分类转换失败：' + String(error));
        return '[]';
    }
}



function _filterValue(value) {
    if (value === null || value === undefined || value === '全部') return '';
    return String(value);
}



function _isCategoryKey(value) {
    var key = String(value || '');
    var home = _getHome();
    var groups = _legacyIsArray(home.vod_list) ? home.vod_list : [];
    for (var index = 0; index < groups.length; index += 1) {
        var group = groups[index] || {};
        var groupKey = String(group.sort_id === null || group.sort_id === undefined ? '' : group.sort_id);
        if (groupKey === key) return true;
    }
    return false;
}



function _filteredPage(category, filters, page) {
    var source = filters || {};
    var classValue = _filterValue(source['class'] || source.type || '');
    var yearValue = _filterValue(source.year || '');
    var sortValue = _filterValue(source.sort || '');
    if (sortValue === '按评分') sortValue = 'vod_score';
    if (sortValue === '按时间') sortValue = '';
    var url = 'app/vod/filter?page=' + encodeUri(String(page || 1)) +
        '&class_id=' + encodeUri(_filterValue(category)) +
        '&vod_class=' + encodeUri(classValue) +
        '&year=' + encodeUri(yearValue) +
        '&sort_by=' + encodeUri(sortValue);
    var data = _payload(_apiGet(url));
    return _cards(data.filter_vods, '');
}



function searchFiltered(category, filtersJson, page) {
    try {
        if (_filterValue(category) === '') return JSON.stringify(_flattenHome());
        var filters = _safeParse(filtersJson, {}) || {};
        return JSON.stringify(_filteredPage(category, filters, page || 1));
    } catch (error) {
        _lanercLog('分类筛选失败：' + String(error));
        return '[]';
    }
}



function _loadRuntimeConfig() {
    if (_lanercRuntime !== null) return _lanercRuntime;
    var configPath = _legacyTrim(_lanercExt.runtimeConfigPath) || _LANERC_RUNTIME_CONFIG_PATH;
    var data = _apiGet(configPath);
    _lanercRuntime = {
        sign: String(_findDeep(data, 'sign') || ''),
        auth: String(_findDeep(data, 'auth') || '')
    };
    return _lanercRuntime;
}



function _runtimeValues(flagData) {
    var flag = flagData && typeof flagData === 'object' ? flagData : {};
    var sign = _firstValue(flag, ['sign']);
    if (sign === '') sign = _firstValue(_lanercExt, ['sign']);
    var auth = _firstValue(flag, ['auth']);
    if (auth === '') auth = _firstValue(_lanercExt, ['auth']);
    if (sign !== '' && auth !== '') return { sign: String(sign), auth: String(auth) };
    var config = _loadRuntimeConfig();
    if (sign === '') sign = config.sign;
    if (sign === '') sign = _LANERC_BUILD_SIGNATURE;
    if (auth === '') auth = config.auth;
    if (auth === '') auth = _LANERC_AUTH_FALLBACK;
    return { sign: String(sign || ''), auth: String(auth) };
}



function _videoItems(value) {
    if (_legacyIsArray(value)) return value;
    if (value === null || value === undefined || value === '') return [];
    if (typeof value === 'string') {
        var parsed = _safeParse(value, null);
        if (_legacyIsArray(parsed)) return parsed;
        return String(value).split('#');
    }
    return [value];
}



function _episodePart(value, fallbackName) {
    if (value && typeof value === 'object') {
        var objectVid = _firstValue(value, [
            'resource_id', 'resourceId', 'vid', 'video_id', 'videoId',
            'episode_id', 'episodeId', 'id', 'url', 'value'
        ]);
        return {
            name: String(_firstValue(value, ['name', 'title']) || fallbackName || ''),
            vid: String(objectVid || ''),
            raw: String(_firstValue(value, [
                'raw', 'url', 'resource_id', 'resourceId', 'vid', 'video_id',
                'videoId', 'episode_id', 'episodeId', 'id', 'value'
            ]) || ''),
            resourceId: String(_firstValue(value, ['resource_id', 'resourceId']) || ''),
            canPlayWithoutLogin: _lanercBoolean(
                _firstValue(value, ['can_play_without_login', 'canPlayWithoutLogin']), true
            )
        };
    }
    var raw = value === null || value === undefined ? '' : String(value);
    var parts = raw.split('$');
    var videoValue = parts.length > 1 ? parts[parts.length - 1] : raw;
    for (var partIndex = 1; partIndex < parts.length; partIndex += 1) {
        if (/^https?:\/\//i.test(_legacyTrim(parts[partIndex]))) {
            videoValue = parts[partIndex];
            break;
        }
    }
    return {
        name: String(parts[0] || fallbackName || ''),
        vid: String(videoValue || ''),
        raw: raw
    };
}



function _sortPlayLines(left, right) {
    var leftSort = Number(left && left.sort);
    var rightSort = Number(right && right.sort);
    if (!isFinite(leftSort)) leftSort = 0;
    if (!isFinite(rightSort)) rightSort = 0;
    return leftSort - rightSort;
}

 
function _isMainLine(line) {
    var name = String((line && (line.name || line.title)) || '');
    return /LC\s*-?\s*Main/i.test(name);
}



function _episodes(playList, runtime, contentId) {
    var lines = _legacyIsArray(playList) ? playList.slice() : [];
    lines.sort(_sortPlayLines);
    
    
    
    var mainLines = [];
    var otherLines = [];
    for (var splitIndex = 0; splitIndex < lines.length; splitIndex += 1) {
        (_isMainLine(lines[splitIndex]) ? mainLines : otherLines).push(lines[splitIndex]);
    }
    lines = mainLines.concat(otherLines);
    var usedRouteNames = {};
    var result = [];
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        var line = lines[lineIndex] || {};
        
        
        var lineName = _legacyTrim(String(line.name || line.title || '').replace(/[\[【（(].*$/, ''));
        if (!lineName) lineName = '线路' + (lineIndex + 1);
        
        
        var usedCount = usedRouteNames[lineName] || 0;
        usedRouteNames[lineName] = usedCount + 1;
        if (usedCount > 0) lineName = lineName + ' ' + (usedCount + 1);
        var player = String(line.player || '');
        var videos = _videoItems(line.video);
        for (var videoIndex = 0; videoIndex < videos.length; videoIndex += 1) {
            var part = _episodePart(videos[videoIndex], '第' + (videoIndex + 1) + '集');
            if (!part.vid) continue;
            if (_isLanercUpgradePlaceholder(part.name) || _isLanercUpgradePlaceholder(part.raw)) continue;
            var flag = {
                raw: part.raw,
                vid: part.vid,
                player: player,
                sign: runtime.sign,
                auth: runtime.auth
            };
            if (part.resourceId) {
                flag.resourceId = part.resourceId;
                flag.canPlayWithoutLogin = part.canPlayWithoutLogin;
                var knownLegacy = _LANERC_LEGACY_MEDIA_BY_CONTENT[String(contentId || '')];
                if (_legacyIsArray(knownLegacy) && knownLegacy[videoIndex]) {
                    flag.legacyVid = String(knownLegacy[videoIndex]);
                }
            }
            result.push({ name: part.name, url: JSON.stringify(flag), route: lineName });
        }
    }
    return result;
}



function detail(id) {
    var contentId = id === null || id === undefined ? '' : String(id);
    try {
        var data = _payload(_apiGet(_LANERC_V2_DETAIL_PATH + encodeUri(contentId)));
        var usedV2 = !!(data && typeof data === 'object' &&
            (data.video_play_info || data.video_play_list));
        if (!data || typeof data !== 'object' ||
            (!data.video_play_info && !data.video_play_list)) {
            data = _payload(_apiGet('app/getvod/' + encodeUri(contentId)));
        }
        var info = data.video_play_info && typeof data.video_play_info === 'object' ? data.video_play_info : data;
        var runtime = usedV2 ? { sign: '', auth: '' } : _runtimeValues({});
        
        // name 一并存：弹幕定位的「正在播本条目」快捷分支要拿它与所看片名比对（见 _lanercDanmuLocate），
        // 不存名字就无从校验，隔离引擎残留的旧条目会被无条件当成当前片。
        _lanercLastDetail = {
            id: contentId,
            name: String(_firstValue(info, ['vod_name', 'name', 'title']) || ''),
            classId: _legacyTrim(String(_firstValue(info, ['vod_type']) || ''))
        };
        return JSON.stringify({
            id: String(_firstValue(info, ['id', 'vod_id']) || contentId),
            name: String(_firstValue(info, ['vod_name', 'name', 'title']) || ''),
            pic: _lanercCoverPic(_firstValue(info, ['vod_pic', 'pic', 'image', 'cover'])),
            desc: String(_firstValue(info, ['vod_blurb', 'desc', 'vod_content']) || ''),
            type: _typeText(info),
            year: String(_firstValue(info, ['vod_year', 'year']) || ''),
            remarks: String(_firstValue(info, ['vod_sub', 'vod_remarks']) || ''),
            score: String(_firstValue(info, ['vod_score', 'score']) || ''),
            episodes: _episodes(data.video_play_list, runtime, contentId)
        });
    } catch (error) {
        _lanercLog('详情转换失败：' + String(error));
        return JSON.stringify({ id: contentId, name: '', pic: '', desc: '', episodes: [] });
    }
}



function _resolveContentClass(contentId) {
    if (_lanercLastDetail && String(_lanercLastDetail.id) === contentId) return _lanercLastDetail.classId;
    var data = _payload(_apiGet(_LANERC_V2_DETAIL_PATH + encodeUri(contentId)));
    if (!data || typeof data !== 'object' || !data.video_play_info) {
        data = _payload(_apiGet('app/getvod/' + encodeUri(contentId)));
    }
    var info = data.video_play_info && typeof data.video_play_info === 'object' ? data.video_play_info : data;
    return _legacyTrim(String(_firstValue(info, ['vod_type']) || ''));
}



function related(id) {
    var contentId = id === null || id === undefined ? '' : String(id);
    try {
        if (!contentId) return '[]';
        var classId = _resolveContentClass(contentId);
        if (!classId) return '[]';
        var cards = _filteredPage(classId, {}, 1);
        var out = [];
        for (var index = 0; index < cards.length; index += 1) {
            if (String(cards[index].id) === contentId) continue;
            out.push(cards[index]);
            if (out.length >= 20) break;
        }
        return JSON.stringify(out);
    } catch (error) {
        _lanercLog('相关推荐获取失败：' + String(error));
        return '[]';
    }
}



function _mediaType(url) {
    var value = String(url || '');
    if (/\.m3u8(?:$|[?#])/i.test(value)) return 'm3u8';
    if (/\.mp4(?:$|[?#])/i.test(value)) return 'mp4';
    return 'auto';
}



function _isLanercUpgradeMediaUrl(url) {
    var value = String(url || '').toLowerCase();
    if (!value) return false;
    if (value.indexOf('advideolp') !== -1) return true;
    if (value.indexOf('yximgs.com') !== -1) return true;
    if (value.indexOf('ad_alliance') !== -1) return true;
    return false;
}



function _isLanercUpgradePlaceholder(text) {
    var value = String(text || '');
    return value.indexOf('请升级') !== -1 || value.indexOf('请更新') !== -1;
}



function _lanercAcceptPlayUrl(loadUrl) {
    var url = '';
    for (var attempt = 0; attempt < 3; attempt += 1) {
        try {
            url = String(loadUrl() || '');
        } catch (error) {
            _lanercLog('播放地址获取失败：' + String(error));
            url = '';
            continue;
        }
        if (!url || !_isLanercUpgradeMediaUrl(url)) return url;
        if (attempt < 2) _lanercLog('播放接口返回升级提示片，重试第 ' + (attempt + 1) + ' 次');
    }
    return url;
}



function _shouldBlockLanercWarningPlaylist() {
    var value = _lanercExt.blockWarningPlaylist;
    if (value === null || value === undefined || value === '') return _LANERC_BLOCK_WARNING_PLAYLIST;
    return value === true || value === 1 || String(value).toLowerCase() === 'true';
}



function _inspectLanercPlaylist(url, headers) {
    var value = String(url || '');
    if (_isLanercUpgradeMediaUrl(value)) return 1;
    if (!/^https?:\/\//i.test(value)) return -1;
    if (!/\.m3u8(?:$|[?#])/i.test(value)) return 0;
    try {
        var playlist = String(request(
            value,
            _requestOptions(false, _LANERC_WARNING_PLAYLIST_TIMEOUT_MS, value, headers)
        ) || '');
        if (!/^#EXTM3U/m.test(playlist)) return -1;
        var pattern = /#EXTINF:\s*([0-9]+(?:\.[0-9]+)?)/ig;
        var count = 0;
        var duration = 0;
        var matched;
        while ((matched = pattern.exec(playlist)) !== null) {
            count += 1;
            duration += Number(matched[1]);
        }
        var lines = playlist.split(/\r?\n/);
        var segmentCount = 0;
        var disguisedSegmentCount = 0;
        for (var lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            var line = _legacyTrim(lines[lineIndex]);
            if (!line || line.charAt(0) === '#') continue;
            segmentCount += 1;
            if (/\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.test(line)) disguisedSegmentCount += 1;
        }
        if (segmentCount < 1) return -1;
        if (count >= 10 && duration >= 179 && duration <= 181) return 1;
        if (count >= 10 && duration >= 239 && duration <= 241 && disguisedSegmentCount > 0) return 1;
        if (count === 144 && segmentCount === 144 && disguisedSegmentCount === 144 &&
            duration >= 1199 && duration <= 1201) return 1;
        if (count === 173 && segmentCount === 173 && disguisedSegmentCount === 173 &&
            duration >= 1439 && duration <= 1441) return 1;
        return 0;
    } catch (error) {
        _lanercLog('防盗提示片检测失败：' + String(error));
        return -1;
    }
}



function _lanercOfficialMediaCandidates(vid) {
    var episodeId = _legacyTrim(vid).toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(episodeId)) return [];
    var hosts = _lanercStringList(_lanercExt.officialMediaHosts, _LANERC_OFFICIAL_MEDIA_HOSTS);
    var buckets = _lanercStringList(_lanercExt.officialMediaBuckets, _LANERC_OFFICIAL_MEDIA_BUCKETS);
    var list = [];
    for (var hostIndex = 0; hostIndex < hosts.length; hostIndex += 1) {
        var host = _legacyTrim(hosts[hostIndex]).replace(/\/+$/, '');
        if (!/^https?:\/\//i.test(host)) continue;
        for (var bucketIndex = 0; bucketIndex < buckets.length; bucketIndex += 1) {
            var bucket = _legacyTrim(buckets[bucketIndex]).replace(/^\/+|\/+$/g, '');
            if (!bucket) continue;
            list.push(host + '/' + bucket + '/' + episodeId + '.m3u8');
        }
    }
    return list;
}



function _resolveLanercOfficialMedia(vid) {
    var candidates = _lanercOfficialMediaCandidates(vid);
    for (var index = 0; index < candidates.length; index += 1) {
        var url = candidates[index];
        if (_inspectLanercPlaylist(url, {}) === 0) {
            if (index > 0) _lanercLog('官方正片命中备用镜像：' + url);
            return url;
        }
    }
    return '';
}



function _isLanercWarningPlaylist(url, headers) {
    return _inspectLanercPlaylist(url, headers) === 1;
}



function _lanercPlayError(message, gate) {
    var text = String(message || '未获取到播放地址');
    var body = {
        url: '',
        type: 'auto',
        error: text,
        _server_msg: text
    };
    if (gate === 'login') {
        body.needLogin = true;
        body.loginMsg = text;
    } else if (gate === true) {
        body.needBind = true;
    }
    return JSON.stringify(body);
}



function _resolveLanercPlay(body, forcedMode) {
    var resolverMode = _legacyTrim(forcedMode || _lanercExt.playResolver || _lanercExt.resolver || _LANERC_PLAY_RESOLVER).toLowerCase();
    if (resolverMode !== 'x3x' && resolverMode !== 'x4x' && resolverMode !== 'auto') resolverMode = 'auto';
    var useProtobuf = resolverMode !== 'x3x' &&
        _lanercBoolean(_lanercExt.playResolveProtobuf, true);
    if (useProtobuf) {
        try {
            var protobuf = _postLanercProtobuf(
                _resolveHost() + _lanercSignedApiPath(_LANERC_PLAY_RESOLVE_PATH), body
            );
            var protobufUrl = _playUrlFromProtobufResponse(protobuf);
            if (protobufUrl) {
                return {
                    url: protobufUrl,
                    response: { play_url: protobufUrl, resolver: 'proxyx4x' },
                    resolver: 'proxyx4x'
                };
            }
            _lanercLog('proxyx4x 未解出服务端 playUrl，不降级旧 proxyx3x');
        } catch (protobufError) {
            _lanercLog('proxyx4x 解码失败，不降级旧 proxyx3x：' + String(protobufError));
        }
        return { url: '', response: {}, resolver: 'proxyx4x' };
    }
    var response = _apiPost(_lanercSignedApiPath('app/proxyx3x'), body);
    return {
        url: _playUrlFromResponse(response),
        response: response,
        resolver: 'proxyx3x'
    };
}


function play(flag) {
    try {
        var parsed = _safeParse(flag, null);
        var flagData = parsed && typeof parsed === 'object' && !_legacyIsArray(parsed) ? parsed : {};
        var rawFlag = flag === null || flag === undefined ? '' : String(flag);
        var resourceId = _firstValue(flagData, ['resource_id', 'resourceId']);
        if (resourceId !== '') resourceId = _normalizePlayText(resourceId);
        if (resourceId) {
            var canPlayWithoutLogin = _lanercBoolean(
                _firstValue(flagData, ['canPlayWithoutLogin', 'can_play_without_login']), true
            );
            var userToken = _lanercUserAccessToken();
            var guestRecord = _lanercGuestCredentialRecord(flagData);
            if (guestRecord.error) {
                return _lanercPlayError(guestRecord.error, true);
            }
            if (!canPlayWithoutLogin && !userToken) {
                if (!guestRecord.credential) {
                    return _lanercPlayError('该剧集需要先完成游客验证码验证', true);
                }
                var restrictedGuestUrl = _lanercAcceptPlayUrl(function () {
                    return _playUrlFromProtobufResponse(_postLanercGuestPlay(resourceId, guestRecord));
                });
                if (restrictedGuestUrl && !_isLanercUpgradeMediaUrl(restrictedGuestUrl)) {
                    var restrictedGuestResult = _playResult({ resolver: 'guest-v2' }, restrictedGuestUrl);
                    if (_shouldBlockLanercWarningPlaylist() &&
                        _inspectLanercPlaylist(restrictedGuestUrl, restrictedGuestResult.headers || {}) === 1) {
                        return _lanercPlayError('检测到升级提示片，当前游客线路不可播放');
                    }
                    return JSON.stringify(restrictedGuestResult);
                }
                if (restrictedGuestUrl && _isLanercUpgradeMediaUrl(restrictedGuestUrl)) {
                    return _lanercPlayError('游客凭证已生效，但服务端当前只返回升级提示片，未下发正片地址');
                }
                return _lanercPlayError('游客凭证无效或已失效，请重新完成验证码验证', true);
            }
            var v2Url = _lanercAcceptPlayUrl(function () {
                return _playUrlFromProtobufResponse(_postLanercV2Play(resourceId));
            });
            var v2Blocked = _isLanercUpgradeMediaUrl(v2Url);
            if (v2Url && !v2Blocked) {
                var v2Result = _playResult({ resolver: 'v2' }, v2Url);
                if (_shouldBlockLanercWarningPlaylist() &&
                    _inspectLanercPlaylist(v2Url, v2Result.headers || {}) === 1) {
                    return _lanercPlayError('检测到升级提示片，当前线路不可播放');
                }
                return JSON.stringify(v2Result);
            }
            if (!guestRecord.error && guestRecord.credential) {
                var guestUrl = _lanercAcceptPlayUrl(function () {
                    return _playUrlFromProtobufResponse(_postLanercGuestPlay(resourceId, guestRecord));
                });
                if (guestUrl && !_isLanercUpgradeMediaUrl(guestUrl)) {
                    var guestResult = _playResult({ resolver: 'guest-v2' }, guestUrl);
                    if (_shouldBlockLanercWarningPlaylist() &&
                        _inspectLanercPlaylist(guestUrl, guestResult.headers || {}) === 1) {
                        return _lanercPlayError('检测到升级提示片，当前游客线路不可播放');
                    }
                    return JSON.stringify(guestResult);
                }
            }
            if (v2Blocked) {
                if (guestRecord.credential) {
                    return _lanercPlayError('游客凭证已生效，但服务端当前只返回升级提示片，未下发正片地址');
                }
                if (!_lanercUserAccessToken()) {
                    return _lanercPlayError('该剧集需要先完成游客验证码验证', true);
                }
                return _lanercPlayError('登录后仍未拿到正片地址，请重新登录后再试');
            }
            var legacyVid = _normalizePlayText(_firstValue(flagData, ['legacyVid', 'legacy_vid']));
            if (legacyVid) {
                var legacyUrl = _resolveLanercOfficialMedia(legacyVid);
                if (legacyUrl) {
                    _lanercLog('v2 登录门槛命中已验证旧媒体映射：' + legacyUrl);
                    return JSON.stringify({ url: legacyUrl, type: 'm3u8' });
                }
            }
            if (!canPlayWithoutLogin) {
                if (!userToken) {
                    return _lanercPlayError('该剧集需要先完成游客验证码验证', true);
                }
                return _lanercPlayError('登录后仍未拿到正片地址，请重新登录后再试');
            }
            return _lanercPlayError('新版播放接口未返回媒体地址');
        }
        var vid = _firstValue(flagData, [
            'vid', 'video_id', 'videoId', 'episode_id', 'episodeId', 'play_url', 'playUrl', 'url'
        ]);
        if (vid === '') {
            vid = rawFlag;
            if (!parsed && rawFlag.indexOf('$') !== -1) vid = _episodePart(rawFlag, '').vid;
        }
        vid = _normalizePlayText(vid);
        if (vid.indexOf('$') !== -1 && !/^https?:\/\//i.test(vid)) {
            vid = _episodePart(vid, '').vid;
        }
        if (/^https?:\/\/[^\s]+\.(?:m3u8|mp4|flv)(?:$|[?#])/i.test(vid)) {
            if (_isLanercUpgradeMediaUrl(vid)) return _lanercPlayError('检测到升级提示片，当前线路不可播放');
            if (_shouldBlockLanercWarningPlaylist() && /\.m3u8(?:$|[?#])/i.test(vid)) {
                var directState = _inspectLanercPlaylist(vid, {});
                if (directState === 1) return _lanercPlayError('检测到防盗提示片，当前线路不可播放');
            }
            return JSON.stringify({ url: vid, type: _mediaType(vid) });
        }
        var requestedResolver = _legacyTrim(_lanercExt.playResolver || _lanercExt.resolver || _LANERC_PLAY_RESOLVER).toLowerCase();
        var officialOnly = requestedResolver === 'official' || requestedResolver === 'direct' || requestedResolver === 'media';
        if (requestedResolver !== 'x3x' && requestedResolver !== 'x4x' && requestedResolver !== 'auto' && !officialOnly) {
            requestedResolver = 'auto';
        }
        if (officialOnly) {
            var officialOnlyUrl = _resolveLanercOfficialMedia(vid);
            if (officialOnlyUrl) return JSON.stringify({ url: officialOnlyUrl, type: 'm3u8' });
            return _lanercPlayError('官方正片镜像暂不可用');
        }
        if (requestedResolver === 'auto') {
            var officialUrl = _resolveLanercOfficialMedia(vid);
            if (officialUrl) return JSON.stringify({ url: officialUrl, type: 'm3u8' });
        }
        var runtime = _runtimeValues(flagData);
        var body = {
            vid: String(vid || ''),
            player: String(_firstValue(flagData, ['player']) || ''),
            sign: runtime.sign,
            auth: runtime.auth
        };
        if (!body.vid) return _lanercPlayError('缺少剧集播放标识');
        var resolved = { url: '', response: {}, resolver: '' };
        var playUrl = _lanercAcceptPlayUrl(function () {
            resolved = _resolveLanercPlay(body,
                requestedResolver === 'x3x' || requestedResolver === 'x4x' ? requestedResolver : 'auto');
            return resolved.url;
        });
        var response = resolved.response;
        if (!playUrl) return _lanercPlayError('播放接口未返回媒体地址');
        if (_isLanercUpgradeMediaUrl(playUrl)) return _lanercPlayError('检测到升级提示片，当前线路不可播放');
        var result = _playResult(response, playUrl);
        var playlistState = _shouldBlockLanercWarningPlaylist()
            ? _inspectLanercPlaylist(playUrl, result.headers || {}) : 0;
        if (_shouldBlockLanercWarningPlaylist() && playlistState === 1) {
            _lanercLog('检测到防盗提示片（' + resolved.resolver + '），重新签名请求一次');
            if (playlistState === 1) return _lanercPlayError('检测到防盗提示片，当前线路不可播放');
        }
        return JSON.stringify(result);
    } catch (error) {
        _lanercLog('播放解析失败：' + String(error));
        return _lanercPlayError('播放解析失败：' + String(error));
    }
}


// ───────────────────────────── 源自带弹幕（barragev2）─────────────────────────────
// 依据 lanerc 1.08 逆向 + 真机 replay 核对：GET app/chat/barragev2?vid=<内容id>&vod=<集号(1基)>，
// 返回 code=201 的 AES 密文（_apiGet 里 _decodeApiResponse 已自动解密），明文 { new_barrages, old_barrages }。
// 单条 { id, bcolor:"#AARRGGBB", position:0滚动/1顶部, second:秒, content:文本 }。
// 已用 6703 实测确认：vid=内容 id（= detail 存的 _lanercLastDetail.id）、vod=集号(=episode+1，vod=1/2 返回不同集)、
// second=秒。App 契约 [{time(秒),text,color?,mode?}]：position(0滚/1顶) 映射成 mode(0滚/1顶)一并给出。
//
// 作为「弹幕专用源」（danmuOnly，用户拿别的源播放、这里只供弹幕）时的定位（2026-08-26 修
// 「前面几集弹幕很多、后面几集一条没有」）：播放源常把多季连排成一个选集列表（24 集 = 两季各 12 集），
// 而本站按季拆条目——老逻辑拿 search 首个结果 + vod=下标+1，第 13 集起 vod 越界永远拿不到弹幕。
// 现在按「基础片名 + 季号」归组候选，从第 1 季起连续累计集数，把连排的全局集号换算成
// 「某季条目 + 季内集号」；断季即停、落点必须在所看季及之后（宁可不出弹幕也不错配）。


// 解析「第N集/话/回」「EPn」「纯数字」→ 集号；解析不出返回 0（调用方退回下标+1）。
function _lanercEpNoOf(label) {
    var s = _legacyTrim(label);
    if (!s) return 0;
    var m = s.match(/第\s*(\d{1,4})\s*[集话話回]/);
    if (m) return parseInt(m[1], 10) || 0;
    m = s.match(/(?:ep|episode)\s*(\d{1,4})/i);
    if (m) return parseInt(m[1], 10) || 0;
    if (/^\d{1,4}$/.test(s)) return parseInt(s, 10) || 0;
    return 0;
}


// 中文/阿拉伯数字 → 整数（季号用，支持一~九十九）；解析不出返回 0。
function _lanercCnNum(s) {
    var direct = parseInt(s, 10);
    if (isFinite(direct) && direct > 0) return direct;
    var d = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    if (String(s).indexOf('十') < 0) {
        var one = d[String(s).charAt(0)];
        return one === undefined ? 0 : one;
    }
    var parts = String(s).split('十');
    var tens = parts[0] === '' ? 1 : d[parts[0].charAt(0)];
    if (tens === undefined) return 0;
    var ones = (parts.length > 1 && parts[1] !== '') ? (d[parts[1].charAt(0)] || 0) : 0;
    return tens * 10 + ones;
}


var _LANERC_ROMAN_SEASON = {
    '\u2160': 1, '\u2161': 2, '\u2162': 3, '\u2163': 4, '\u2164': 5, '\u2165': 6,
    '\u2170': 1, '\u2171': 2, '\u2172': 3, '\u2173': 4, '\u2174': 5, '\u2175': 6
};


// 从片名解析季号并剥掉季标记（口径对齐 App DanmuApiClient.parseSeason 的常见形态）：
// 「第X季/第X部」（中文/阿拉伯数字）、「Season N」「SN」、罗马数字（Ⅱ / 词尾 II~V）、裸尾数字 2~9。
// 返回 { base: 归一化基础名(小写、只留字母数字汉字), season: 季号(默认 1) }。
function _lanercSeasonOf(rawName) {
    var s = ' ' + _legacyTrim(rawName) + ' ';
    var season = 0;
    var m = s.match(/第\s*([0-9一二三四五六七八九十两]+)\s*[季部]/);
    if (m) {
        var n = _lanercCnNum(m[1]);
        if (n > 0) season = n;
        s = s.replace(m[0], ' ');
    }
    if (!season) {
        m = s.match(/season\s*(\d{1,2})/i);
        if (m) { season = parseInt(m[1], 10) || 0; s = s.replace(m[0], ' '); }
    }
    if (!season) {
        m = s.match(/([^0-9A-Za-z])[Ss](\d{1,2})(?![0-9A-Za-z])/);
        if (m) { season = parseInt(m[2], 10) || 0; s = s.replace(m[0], m[1]); }
    }
    if (!season) {
        m = s.match(/[\u2160-\u2175]/);
        if (m && _LANERC_ROMAN_SEASON[m[0]]) {
            var stripped = s.replace(m[0], ' ');
            if (_legacyTrim(stripped)) { season = _LANERC_ROMAN_SEASON[m[0]]; s = stripped; }
        }
    }
    if (!season) {
        m = s.match(/\s(II|III|IV|V)\s*$/);
        if (m) {
            season = { II: 2, III: 3, IV: 4, V: 5 }[m[1]] || 0;
            if (season) s = s.replace(m[0], ' ');
        }
    }
    if (!season) {
        m = s.match(/\s([2-9])\s*$/);
        if (m) {
            var stripped2 = s.replace(m[0], ' ');
            if (_legacyTrim(stripped2)) { season = parseInt(m[1], 10); s = stripped2; }
        }
    }
    var base = s.toLowerCase().replace(/[^0-9a-z\u4e00-\u9fff]/g, '');
    return { base: base, season: season > 0 ? season : 1 };
}


// 条目集数缓存（引擎存活期内有效）：danmuOnly 隔离引擎按源池化复用，切集连拉时不重复打详情接口。
var _lanercDanmuCountCache = {};


// 某内容条目的集数：直接打详情接口数各线路集数取最大（各线路可能缺集）。
// 不走公开 detail()——那会覆盖 _lanercLastDetail、还做一堆这里用不上的转换。失败返回 0。
function _lanercEpisodeCountOf(contentId) {
    var key = String(contentId);
    if (_lanercDanmuCountCache[key] !== undefined) return _lanercDanmuCountCache[key];
    var count = 0;
    try {
        var data = _payload(_apiGet(_LANERC_V2_DETAIL_PATH + encodeUri(key)));
        if (!data || typeof data !== 'object' || (!data.video_play_info && !data.video_play_list)) {
            data = _payload(_apiGet('app/getvod/' + encodeUri(key)));
        }
        var lines = data && _legacyIsArray(data.video_play_list) ? data.video_play_list : [];
        for (var i = 0; i < lines.length; i += 1) {
            var n = _videoItems((lines[i] || {}).video).length;
            if (n > count) count = n;
        }
    } catch (error) {
        _lanercLog('弹幕数集数失败：' + String(error));
    }
    _lanercDanmuCountCache[key] = count;
    return count;
}


// 弹幕定位：返回 { id: 内容id, vod: 站内集号(1基) }；定位不到返回 null。
// target = 目标集号（1 基，全局连排口径：集名解析出的真实集号，退回下标+1）。
function _lanercDanmuLocate(payload, target, episodeIdx) {
    var title = _legacyTrim(payload && payload.title);
    // 正在用本源播放（主引擎场景）时 vid/vod 与所看条目天然对齐，可以直用 —— 但必须先校验
    // 存下的条目名与所看片名真的对得上（基础名相等/互为前缀，口径同下方搜索归组）。
    // danmuOnly 隔离引擎按源池化复用，_lanercLastDetail 可能是先前跨源播放残留的**另一部片**；
    // 旧版无条件直用，表现是之后看任何片都拉那部旧片的弹幕、每集还都定位到它的同一集
    // （2026-08-27 用户反馈「lanerc 弹幕有问题，全都是 794 个弹幕」的根因）。
    // 老引擎里残留的 _lanercLastDetail 没有 name 字段 → 校验不过 → 走搜索定位，天然安全。
    if (_lanercLastDetail && _lanercLastDetail.id && title) {
        var lastGot = _lanercSeasonOf(String(_lanercLastDetail.name || ''));
        var lastWant = _lanercSeasonOf(title);
        if (lastGot.base && lastWant.base &&
            (lastGot.base === lastWant.base ||
                lastGot.base.indexOf(lastWant.base) === 0 ||
                lastWant.base.indexOf(lastGot.base) === 0)) {
            return { id: String(_lanercLastDetail.id), vod: episodeIdx + 1 };
        }
    }
    if (!title) return null;
    var cards = [];
    try {
        cards = _safeParse(search(title, 1), []) || [];
    } catch (error) {
        _lanercLog('弹幕定位搜索失败：' + String(error));
        return null;
    }
    if (!_legacyIsArray(cards) || !cards.length) return null;
    var want = _lanercSeasonOf(title);
    // 基础名有关联（相等/互为前缀）的候选按季号归组，每季留首个
    var bySeason = {};
    var matchedAny = false;
    for (var i = 0; i < cards.length; i += 1) {
        var card = cards[i] || {};
        if (!card.id || !card.name) continue;
        var got = _lanercSeasonOf(String(card.name));
        if (!got.base || !want.base) continue;
        if (got.base !== want.base &&
            got.base.indexOf(want.base) !== 0 && want.base.indexOf(got.base) !== 0) continue;
        matchedAny = true;
        if (bySeason[got.season] === undefined) bySeason[got.season] = String(card.id);
    }
    // 名字全对不上：宁可不出弹幕（2026-08-27 用户反馈「弹幕匹配乱来、不是当前剧集的」）。
    // 旧兜底拿 search 首个结果——站内搜索按热度/相关度排序，名字对不上时首个基本是无关番，
    // 错的弹幕比没弹幕伤害大得多；与 App 侧匹配「宁缺勿错」口径对齐。
    if (!matchedAny) return null;
    // 所看季的条目集数够 → 直接命中（最常见：单季番 / 分季播放源）
    var direct = bySeason[want.season];
    if (direct !== undefined) {
        var directCount = _lanercEpisodeCountOf(direct);
        if (target <= directCount) return { id: direct, vod: target };
    }
    // 续季滚动：从第 1 季起连续累计集数，把连排全局集号换算成「某季条目 + 季内集号」。
    // 断季（缺第 N 季条目）即停；落点必须在所看季及之后——落在之前说明集号并非连排全局编号，拒。
    var remaining = target;
    for (var season = 1; season <= 24; season += 1) {
        var id = bySeason[season];
        if (id === undefined) return null;
        var count = _lanercEpisodeCountOf(id);
        if (count <= 0) return null;
        if (remaining <= count) {
            if (season < want.season) return null;
            return { id: id, vod: remaining };
        }
        remaining -= count;
    }
    return null;
}


function _lanercDanmuColor(value) {
    if (value === null || value === undefined || value === '') return 16777215;
    var text = String(value).replace(/^#/, '');
    if (/^[0-9a-f]{8}$/i.test(text)) return parseInt(text.slice(2), 16); // "#AARRGGBB"：丢 alpha 取 RGB
    if (/^[0-9a-f]{6}$/i.test(text)) return parseInt(text, 16);
    var num = Number(text);
    return isFinite(num) && num > 0 ? Math.floor(num) : 16777215;
}


function _lanercDanmuList(data) {
    var out = [];
    var groups = [data.new_barrages, data.old_barrages];
    for (var g = 0; g < groups.length; g += 1) {
        var list = groups[g];
        if (typeof list === 'string') list = _safeParse(list, []);
        if (!_legacyIsArray(list)) continue;
        for (var i = 0; i < list.length; i += 1) {
            var item = list[i] || {};
            var rawTime = _firstValue(item, ['second', 'time_point', 'time', 'sec', 'offset']);
            if (rawTime === '') continue;
            var time = Number(rawTime);
            if (!isFinite(time) || time < 0) continue;
            var text = _legacyTrim(_firstValue(item, ['content', 'text', 'msg']));
            if (!text) continue;
            // position：0=滚动 / 1=顶部固定（barragev2 实测口径）。映射成 App 契约的 mode（0滚/1顶/2底）。
            out.push({
                time: time,
                text: text,
                color: _lanercDanmuColor(_firstValue(item, ['bcolor', 'color'])),
                mode: (Number(_firstValue(item, ['position', 'mode', 'pos'])) === 1) ? 1 : 0
            });
        }
    }
    return out;
}


function danmu(payloadJson) {
    try {
        var payload = _safeParse(payloadJson, {}) || {};
        var episodeIdx = Math.floor(Number(payload.episode));
        if (!isFinite(episodeIdx) || episodeIdx < 0) episodeIdx = 0;
        // 目标集号：优先从集显示名解析真实集号（App 2026-08-26 起在 payload 带 episodeLabel，
        // 绕开选集混预告/花絮的下标错位），解析不出退回下标+1（旧行为）。
        var target = _lanercEpNoOf(payload.episodeLabel);
        if (target <= 0) target = episodeIdx + 1;
        var located = _lanercDanmuLocate(payload, target, episodeIdx);
        if (!located) return '[]';
        // 必须签名（2026-08-27）：barragev2 不带 sign 会被服务端降级成全站公共弹幕池（vid/vod 全忽略，
        // 表现为「看什么片都是同一批」）。签名后 vid 按剧、vod 按集精确生效。_apiGet 只拼 host、不再加签，
        // 传入的已是签好的完整路径。
        var data = _payload(_apiGet(_lanercSignedApiPath(
            'app/chat/barragev2?vid=' + encodeUri(located.id) + '&vod=' + encodeUri(String(located.vod))
        )));
        if (!data || typeof data !== 'object') return '[]';
        return JSON.stringify(_lanercDanmuList(data));
    } catch (error) {
        _lanercLog('弹幕获取失败：' + String(error));
        return '[]';
    }
}
