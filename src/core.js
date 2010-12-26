function baseName(s) {
    return s
        .replace(/\?.*$/, '')  // strip query string if any
        .replace(/\\/, '/')    // Windows backward slashes
        .replace(/^.*\//, '')  // strip the path
        .replace(/^.*:/, '');  // strip the drive part for rare cases like "c:foo.txt" (yeah, I'm paranoid)
}

var insertAfter = function(newElement, targetElement) {
    var parent = targetElement.parentNode;
    if (parent.lastChild == targetElement) {
        parent.appendChild(newElement);
    } else {
        parent.insertBefore(newElement, targetElement.nextSibling);
    }
};

/**
 * @nosideeffects
 * @return {string}
 */
function generateExpando() {
    return 'livereload=' + Date.now();
}

/**
 * @param {string} url
 * @param {string} [expando]
 * @nosideeffects
 * @return {string}
 */
function generateNextUrl(url, expando) {
    expando = expando || generateExpando();

    var hashIndex = url.indexOf('#');
    var hash = '';
    if (hashIndex != -1) {
        hash = url.slice(hashIndex);
        url = url.slice(0, hashIndex);
    }

    var paramsIndex = url.indexOf('?');
    var params = '';
    if (paramsIndex != -1) {
        params = url.slice(paramsIndex);
        var re = /(\?|&)livereload=(\d+)/;
        if (re.test(params)) {
            params = params.replace(re, function(match, separator){
                return separator + expando;
            });
        } else {
            params += '&' + expando;
        }
        url = url.slice(0, paramsIndex);
    } else {
        params += '?' + expando;
    }

    return url + params + hash;
}

function reloadScript(element) {
    console.log("Reloading script: " + element.src);
    var clone = element.cloneNode(false);
    clone.src = generateNextUrl(element.src);
    element.parentNode.replaceChild(clone, element);
}

function reloadStylesheet(stylesheet) {
    var element = stylesheet.ownerNode;
    console.log("Reloading stylesheet: " + element.href);
    var clone = element.cloneNode(false);
    clone.href = generateNextUrl(element.href);
    insertAfter(clone, element);
    stylesheet.reloadingViaLiveReload = 1;
    setTimeout(function() {
        if (element.parentNode)
            element.parentNode.removeChild(element);
    }, 1000);
}

/**
 * Recursevly reload all stylesheets that match nameToReload
 * @param {CSSStyleSheet} stylesheet
 * @param {string} nameToReload
 * @return {boolean} found or not
 */
function reloadImportedStylesheet(stylesheet, nameToReload) {

    var rules = stylesheet.cssRules;
    if (!rules) {
        console.warn("Can't access stylesheet: " + stylesheet.href);
        return false;
    }

    var found = false;
    for (var i=0; i < rules.length; i++) {
        var rule = rules[i];
        switch (rule.type) {
            case CSSRule.CHARSET_RULE:
                // Only charset rules can precede import rules
                continue;
            case CSSRule.IMPORT_RULE:
                var href = rule.href;
                if (!nameToReload || baseName(href) === nameToReload) {
                    console.log("Reloading imported stylesheet: " + href);
                    var media = rule.media.length ? [].join.call(rule.media, ', ') : '';
                    stylesheet.insertRule('@import url("' + generateNextUrl(href) + '") ' + media + ';', i);
                    stylesheet.deleteRule(i + 1);
                    found = true;
                } else {
                    found = reloadImportedStylesheet(rule.styleSheet, nameToReload) || found;
                }
                break;
            default:
                return found;
        }
    }
    return found;
}

function performLiveReload(data) {
    var parsed = JSON.parse(data);
    var name, found;

    if (parsed[0] != "refresh") {
        console.error("Unknown command: " + parsed[0]);
        return;
    }

    var options = parsed[1];
    var nameToReload = baseName(options.path);
    var applyJSLive = (options.apply_js_live !== undefined ? !!options.apply_js_live : true);
    var applyCSSLive = (options.apply_css_live !== undefined ? !!options.apply_css_live : true);

    if (applyJSLive && !found) {
        var scripts = document.scripts;
        for (var i = 0; i < scripts.length; i++) {
            var script = scripts[i];
            if (script.src) {
                name = baseName(script.src);
                if (name == nameToReload) {
                    reloadScript(script);
                    found = true;
                    break;
                }
            }
        }
    }

    if (applyCSSLive && !found && /\.css$/i.test(nameToReload)) {
        var stylesheets = document.styleSheets;
        for (var i = 0; i < stylesheets.length; i++) {
            var stylesheet = stylesheets[i];
            if (stylesheet.href && baseName(stylesheet.href) == nameToReload) {
                if (!stylesheet.reloadingViaLiveReload) {
                    reloadStylesheet(stylesheet);
                    found = true;
                    break;
                } else {
                    console.warn("Stylesheet already has been reloaded:", stylesheet.href);
                }
            } else {
                found = reloadImportedStylesheet(stylesheet, nameToReload) || found;
            }
        }

        if (!found) {
            console.log('LiveReload: "' + nameToReload + '" does not correspond to any stylesheet. Reloading all stylesheets.');
            for (var i = 0; i < stylesheets.length; i++) {
                stylesheet = stylesheets[i];
                if (stylesheet.href) {
                    reloadStylesheet(stylesheet);
                } else {
                    reloadImportedStylesheet(stylesheet);
                }
            }
            found = true;
        }
    }

    if (!found) {
        console.log('LiveReload: reloading the full page because "' + nameToReload + '" does not correspond to any script or stylesheet.');
        window.location.reload();
    }
}