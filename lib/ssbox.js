'use strict';

var request = require('request'),
  url = require('url'),
  path = require('path'),
  fs = require('fs'),
  async = require('async'),
  _ = require('lodash');


function _err(msg) {
  msg = msg || 'Unkown Error';

  return new Error(msg);
}

function _json(str) {
  var obj;

  try {
    obj = JSON.parse(str);
  } catch (e) {
    obj = str;
  }

  return obj;
}

function SSBoxClient(account, password) {
  this._baseUrl = url.format({
    protocol: 'https',
    hostname: 'ssbox.unicloud.org.tw'
  });

  this._request = request.defaults({
    'auth': {
      user: account,
      pass: password
    },
    'json': {},
    'pool.maxSockets': 100,
    'strictSSL': false
  });
}


SSBoxClient.prototype.account = function (callback) {
  this._request.get({
    uri: url.resolve(this._baseUrl, '/api/account/info')
  }, function (err, res, body) {
    if (!err && res.statusCode === 200) {
      callback(null, body);
    } else {
      callback(err || body.error ? _err(body.error) : _err());
    }
  });
};


SSBoxClient.prototype.metadata = function (dPath) {
  var callback, params;

  if (typeof arguments[arguments.length - 1] === 'function') {
    callback = arguments[arguments.length - 1];
  }
  if (typeof arguments[1] === 'object') {
    params = arguments[1];
  }

  this._request.get({
    uri: url.resolve(this._baseUrl, '/api/metadata/' + dPath),
    qs: params || {}
  }, function (err, res, body) {
    if (!err && res.statusCode === 200) {
      callback(null, body);
    } else {
      callback(err || body.error ? _err(body.error) : _err());
    }
  });
};

SSBoxClient.prototype.get = function (dPath, callback) {
  return this._request.get({
    uri: url.resolve(this._baseUrl, '/api/files/' + dPath),
    encoding: null
  }, function (err) {
    if (typeof callback === 'function') {
      callback(err);
    }
  });
};

SSBoxClient.prototype.download = function (dPath, dest, callback) {
  var tmpFSStream = fs.createWriteStream(dest);

  tmpFSStream.on('error', function (err) {
    return callback(err);
  });
  tmpFSStream.on('finish', function () {
    return callback(null);
  });

  this._request.get({
    uri: url.resolve(this._baseUrl, '/api/files/' + dPath),
    encoding: null
  }).pipe(tmpFSStream);
};

SSBoxClient.prototype.put = function (dPath) {
  var params, callback;

  if (typeof arguments[arguments.length - 1] === 'function') {
    callback = arguments[arguments.length - 1];
  }
  if (typeof arguments[1] === 'object') {
    params = arguments[1];
  }

  return this._request.put({
    uri: url.resolve(this._baseUrl, '/api/files/' + dPath),
    qs: params || {},
    json: null,
  }, function (err) {
    return callback ? callback(err) : null;
  });
};

SSBoxClient.prototype.upload = function (dPath, src) {
  var params, callback, tmpFSStream;

  if (typeof arguments[arguments.length - 1] === 'function') {
    callback = arguments[arguments.length - 1];
  }
  if (typeof arguments[2] === 'object') {
    params = arguments[2];
  }
  if (!fs.existsSync(src)) {
    return callback(new Error('Source file doesn not exists'));
  }

  tmpFSStream = fs.createReadStream(src);
  tmpFSStream.on('error', function (err) {
    return callback(err);
  });
  tmpFSStream.on('close', function () {
    return callback(null);
  });

  fs.stat(src, function (err, stats) {
    if (err) {
      return callback(err);
    }

    tmpFSStream.pipe(this._request.put({
      uri: url.resolve(this._baseUrl, '/api/files/' + dPath),
      headers: {
        'Content-Length': stats.size
      },
      json: null,
      qs: params || {}
    }, function (err) {
      return callback ? callback(err) : null;
    }));
  }.bind(this));
};

SSBoxClient.prototype.createFolder = function (dPath, callback) {
  this._request.post({
    uri: url.resolve(this._baseUrl, '/api/fileops/create_folder'),
    form: {
      path: dPath
    },
    json: null
  }, function (err, res, body) {
    body = _json(body);
    if (!err && res.statusCode === 200) {
      callback(null);
    } else {
      callback(err || body.error ? _err(body.error) : _err());
    }
  });
};

SSBoxClient.prototype.del = function (dPath, callback) {
  this._request.post({
    uri: url.resolve(this._baseUrl, '/api/fileops/delete'),
    form: {
      path: dPath
    },
    json: null
  }, function (err, res, body) {
    body = _json(body);
    if (!err && res.statusCode === 200) {
      callback(null);
    } else {
      callback(err || body.error ? _err(body.error) : _err());
    }
  });
};

SSBoxClient.prototype.mv = function (sPath, dPath, callback) {
  this._request.post({
    uri: url.resolve(this._baseUrl, '/api/fileops/move'),
    form: {
      from_path: sPath,
      to_path: dPath
    },
    json: null
  }, function (err, res, body) {
    body = _json(body);
    if (!err && res.statusCode === 200) {
      callback(null);
    } else {
      callback(err || body.error ? _err(body.error) : _err());
    }
  });
};

SSBoxClient.prototype.cp = function (sPath, dPath, callback) {
  this._request.post({
    uri: url.resolve(this._baseUrl, '/api/fileops/copy'),
    form: {
      from_path: sPath,
      to_path: dPath
    },
    json: null
  }, function (err, res, body) {
    console.log(err, body);
    body = _json(body);
    if (!err && res.statusCode === 200) {
      callback(null);
    } else {
      callback(err || body.error ? _err(body.error) : _err());
    }
  });
};

SSBoxClient.prototype.fileListRecursive = function (dPath, params, callback) {
  var fileList = [],
    errs = [],
    q;

  if (typeof arguments[arguments.length - 1] === 'function') {
    callback = arguments[arguments.length - 1];
  }
  if (typeof arguments[1] === 'object') {
    params = arguments[1];
  }

  function collect(err, data) {
    if (err || !data.path) {
      errs.push(new Error('Error when collecting some directory metadata'));
      return;
    }

    if (data.is_dir) {
      _.forEach(data.contents, function (ele) {
        if (ele.is_dir) {
          q.push(ele.path, collect);
        } else {
          fileList.push({
            path: ele.path,
            size: ele.size
          });
        }
      });
    }
  }

  q = async.queue((this.metadata).bind(this), 5);

  q.drain = function () {
    if (params && params.order === true) {
      fileList = _.sortBy(fileList, function (file) {
        return file.path.split(path.sep).length;
      });
    }
    callback(errs.length ? new Error('Some error ocurred!') : null, fileList);
  };

  q.push(dPath, collect);
};




module.exports = SSBoxClient;
