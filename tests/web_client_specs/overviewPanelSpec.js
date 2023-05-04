/* global huiTest girderTest describe it runs expect waitsFor */

girderTest.importPlugin('jobs', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui');
girderTest.addScript('/static/built/plugins/histomicsui/huiTest.js');

girderTest.promise.done(function () {
    huiTest.startApp();

    describe('Overview panel tests', function () {
        describe('setup', function () {
            it('login', function () {
                huiTest.login();
            });

            it('open image', function () {
                huiTest.openImage('copy');
            });
            it('open a different image', function () {
                huiTest.openImage('image');
            });
        });

        describe('Check overview actions', function () {
            var main, simulateEvent, overview, frameFeature;

            function simulateAndWait(event, options, wait) {
                wait = wait || 3;
                var count = 0, waitFunc;
                waitFunc = function () {
                    count += 1;
                    if (count < wait) {
                        requestAnimationFrame(waitFunc);
                    }
                };
                runs(function () {
                    simulateEvent(event, options);
                    window.requestAnimationFrame(waitFunc);
                });
                waitsFor(function () {
                    return count >= wait;
                });
            }

            it('overview updates on main image change', function () {
                runs(function () {
                    main = window.geo.jQuery('.geojs-map').data('data-geojs-map');
                    overview = window.geo.jQuery('.geojs-map').eq(1).data('data-geojs-map');
                    simulateEvent = overview.interactor().simulateEvent;
                    frameFeature = overview.layers()[1].features()[0];
                    var frame = frameFeature.data();
                    main.zoom(main.zoom() + 2);
                    expect(frameFeature.data()).not.toEqual(frame);
                    frame = frameFeature.data();
                    main.rotation(1);
                    expect(frameFeature.data()).not.toEqual(frame);
                    main.rotation(0);
                });
            });
            it('click pan', function () {
                var center = main.center();
                simulateAndWait('mousedown', {map: {x: 100, y: 100}, button: 'left'});
                simulateAndWait('mouseup', {map: {x: 100, y: 100}, button: 'left'});
                runs(function () {
                    expect(main.center()).not.toEqual(center);
                });
            });
            it('click drag back to start', function () {
                var center = main.center();
                simulateAndWait('mousedown', {map: {x: 140, y: 120}, button: 'left'});
                simulateAndWait('mousemove', {map: {x: 140, y: 140}, button: 'left'});
                simulateAndWait('mousemove', {map: {x: 140, y: 120}, button: 'left'});
                simulateAndWait('mouseup', {map: {x: 140, y: 120}, button: 'left'});
                runs(function () {
                    expect(main.center().x).toBeCloseTo(center.x);
                    expect(main.center().y).toBeCloseTo(center.y);
                });
            });
            it('click drag', function () {
                var center = main.center();
                simulateAndWait('mousedown', {map: {x: 140, y: 120}, button: 'left'});
                simulateAndWait('mousemove', {map: {x: 140, y: 140}, button: 'left'});
                simulateAndWait('mousemove', {map: {x: 140, y: 150}, button: 'left'});
                simulateAndWait('mouseup', {map: {x: 140, y: 150}, button: 'left'});
                runs(function () {
                    expect(main.center().x).toBeCloseTo(center.x);
                    expect(main.center().y).not.toBeCloseTo(center.y);
                });
            });
            it('click drag outside of zone', function () {
                var center = main.center();
                simulateAndWait('mousedown', {map: {x: 40, y: 20}, button: 'left'});
                simulateAndWait('mousemove', {map: {x: 40, y: 40}, button: 'left'});
                simulateAndWait('mousemove', {map: {x: 40, y: 50}, button: 'left'});
                simulateAndWait('mouseup', {map: {x: 40, y: 50}, button: 'left'});
                runs(function () {
                    expect(main.center().x).toBeCloseTo(center.x);
                    expect(main.center().y).toBeCloseTo(center.y);
                });
            });
            it('left-click drag zero area', function () {
                var center = main.center();
                var zoom = main.zoom();
                simulateAndWait('mousedown', {map: {x: 40, y: 20}, button: 'left', modifiers: 'shift'});
                simulateAndWait('mousemove', {map: {x: 40, y: 20}, button: 'left', modifiers: 'shift'});
                simulateAndWait('mousemove', {map: {x: 40, y: 40}, button: 'left', modifiers: 'shift'});
                simulateAndWait('mouseup', {map: {x: 40, y: 40}, button: 'left', modifiers: 'shift'});
                runs(function () {
                    expect(main.center()).toEqual(center);
                    expect(main.zoom()).toEqual(zoom);
                });
            });
            it('left-click drag', function () {
                var center = main.center();
                var zoom = main.zoom();
                simulateAndWait('mousedown', {map: {x: 40, y: 20}, button: 'left', modifiers: 'shift'});
                simulateAndWait('mousemove', {map: {x: 40, y: 40}, button: 'left', modifiers: 'shift'});
                simulateAndWait('mousemove', {map: {x: 60, y: 40}, button: 'left', modifiers: 'shift'});
                simulateAndWait('mouseup', {map: {x: 60, y: 40}, button: 'left', modifiers: 'shift'});
                runs(function () {
                    expect(main.center()).not.toEqual(center);
                    expect(main.zoom()).not.toEqual(zoom);
                });
            });
        });
    });
});
