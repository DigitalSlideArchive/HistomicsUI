import router from './router';
import HeaderView from './views/layout/HeaderView';
import bindRoutes from './routes';

import layoutTemplate from './templates/layout/layout.pug';
import './stylesheets/layout/layout.styl';
import './stylesheets/body/htk.css';

const _ = girder._;
const Backbone = girder.Backbone;
const GirderApp = girder.views.App;
const eventStream = girder.utilities.eventStream;
const {getCurrentUser, setCurrentToken} = girder.auth;
const {splitRoute} = girder.misc;

function getQuery() {
    var query = document.location.search.replace(/(^\?)/, '').split('&').map(function (n) {
        n = n.split('=');
        if (n[0]) {
            this[decodeURIComponent(n[0].replace(/\+/g, '%20'))] = decodeURIComponent(n[1].replace(/\+/g, '%20'));
        }
        return this;
    }.bind({}))[0];
    return query;
}

var App = GirderApp.extend({
    initialize(settings) {
        if (getQuery().token) {
            setCurrentToken(getQuery().token);
        }
        this.settings = settings;

        // Set the banner color
        const css = `@layer base {
            :root {
              --primary: ${this.bannerColor};
              --secondary: ${this.bannerColor};
              --accent: ${this.bannerColor};
            }
        }`;
        const style = document.createElement('style');
        style.appendChild(document.createTextNode(css));
        document.head.insertBefore(style, document.head.firstChild);

        function hexToHSL(hex) {
            let r = 0, g = 0, b = 0;
            if (hex.length === 4) {
                r = parseInt(hex[1] + hex[1], 16);
                g = parseInt(hex[2] + hex[2], 16);
                b = parseInt(hex[3] + hex[3], 16);
            } else if (hex.length === 7) {
                r = parseInt(hex[1] + hex[2], 16);
                g = parseInt(hex[3] + hex[4], 16);
                b = parseInt(hex[5] + hex[6], 16);
            }
            r /= 255;
            g /= 255;
            b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h = 0, s = 0, l = (max + min) / 2;
            if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }
            s = s * 100;
            l = l * 100;
            h = Math.round(h * 360);
            s = Math.round(s);
            l = Math.round(l);
            return {h, s, l};
        }

        function setColorVariables(hexVar, prefix) {
            const hex = getComputedStyle(document.documentElement).getPropertyValue(hexVar).trim();
            const {h, s, l} = hexToHSL(hex);

            const styles = `
                --${prefix}-h: ${h};
                --${prefix}-s: ${s}%;
                --${prefix}-l: ${l}%;
                --${prefix}-hover: hsl(${h}, ${s}%, ${l + (l > 50 ? -10 : 10)}%);
                --${prefix}-content: hsl(${h}, ${s}%, ${l > 50 ? l - 60 : l + 60}%);
            `;
            return styles;
        }

        function injectStyles() {
            const primaryStyles = setColorVariables('--primary', 'primary');
            const secondaryStyles = setColorVariables('--secondary', 'secondary');
            const accentStyles = setColorVariables('--accent', 'accent');

            let styleElement = document.getElementById('dynamic-color-styles');

            if (!styleElement) {
                styleElement = document.createElement('style');
                styleElement.id = 'dynamic-color-styles';
                document.head.appendChild(styleElement);
            }

            styleElement.textContent = `:root { ${primaryStyles} ${secondaryStyles} ${accentStyles} }`;
        }

        injectStyles();

        return GirderApp.prototype.initialize.apply(this, arguments);
    },

    render() {
        this.$el.html(layoutTemplate());

        this.huiHeader = new HeaderView({
            el: this.$('#g-app-header-container'),
            parentView: this,
            settings: this.settings
        }).render();

        /* Only show job progress */
        const plv = this.progressListView;
        if (!plv._origHandleProgress) {
            plv._origHandleProgress = plv._handleProgress;
            plv._handleProgress = function (progress) {
                if (!_.has(plv._map, progress._id) && (progress.data || {}).resourceName !== 'job') {
                    return;
                }
                return plv._origHandleProgress(progress);
            };
            plv.stopListening(plv.eventStream, 'g:event.progress', plv._origHandleProgress, plv);
            plv.listenTo(plv.eventStream, 'g:event.progress', plv._handleProgress, plv);
        }
        plv.setElement(this.$('#g-app-progress-container')).render();

        return this;
    },

    /**
     * On login we re-render the current body view; whereas on
     * logout, we redirect to the front page.
     */
    login() {
        var route = splitRoute(Backbone.history.fragment).base;
        Backbone.history.fragment = null;
        eventStream.close();

        if (getCurrentUser()) {
            eventStream.open();
            router.navigate(route, {trigger: true});
        } else {
            router.navigate('/', {trigger: true});
        }
    },

    navigateTo(view) {
        if (this.bodyView instanceof view) {
            return this;
        }
        return GirderApp.prototype.navigateTo.apply(this, arguments);
    },

    bindRoutes
});

(function () {
    const vp = document.querySelector('meta[name="viewport"]');

    function update() {
        const minWidth = 775, minHeight = 400;
        const hasVV = !!window.visualViewport;
        const ww = hasVV ? window.visualViewport.width : window.innerWidth;
        const wh = hasVV ? window.visualViewport.height : window.innerHeight;
        if (ww <= minWidth || wh <= minHeight) {
            if (!hasVV || ww / (wh || 1) <= minWidth / minHeight) {
                vp.setAttribute('content', `width=${minWidth}`);
            } else {
                const tw = Math.floor(ww * minHeight / wh);
                vp.setAttribute('content', `width=${tw}`);
            }
        } else {
            vp.setAttribute('content', 'width=device-width, initial-scale=1');
        }
    }

    if (vp) {
        update();
        window.addEventListener('resize', update);
    }
})();

export default App;
