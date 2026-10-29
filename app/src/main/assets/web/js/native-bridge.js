(function () {
  if (!window.AndroidBridge) return;
  var nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var a = this;
    if (!a.hasAttribute('download') || a.href.indexOf('blob:') !== 0) {
      return nativeClick.call(a);
    }
    var name = a.download || 'file';
    fetch(a.href)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        var reader = new FileReader();
        reader.onload = function () {
          var url = String(reader.result);
          AndroidBridge.saveFile(name, blob.type || 'application/octet-stream', url.slice(url.indexOf(',') + 1));
        };
        reader.readAsDataURL(blob);
      });
  };
})();
