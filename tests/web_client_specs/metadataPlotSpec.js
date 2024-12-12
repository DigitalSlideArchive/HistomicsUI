/* global huiTest girderTest describe it runs $ expect girder waitsFor */

girderTest.importPlugin('jobs', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui');
girderTest.addScript('/static/built/plugins/histomicsui/huiTest.js');

girderTest.promise.done(function () {
    huiTest.startApp();

    describe('Metadata plot tests', function () {
        describe('setup', function () {
            it('login', function () {
                huiTest.login();
            });
            it('open image', function () {
                huiTest.openImage('image');
            });
            it('no plot panel without metadata', function () {
                runs(function () {
                    expect($('#h-metadataplot-panel').length).toBe(1);
                    expect($('#h-metadataplot-panel .s-panel-content').length).toBe(0);
                });
            });
            it('add metadata to this and a second image', function () {
                runs(function () {
                    girder.rest.restRequest({
                        url: 'item/' + huiTest.imageId() + '/metadata',
                        contentType: 'application/json',
                        processData: false,
                        method: 'PUT',
                        data: JSON.stringify({
                            gloms: [{
                                Label: 'Old',
                                pas: 2680.166436339452,
                                area: 783.110155889082,
                                aspect: 2.9080459770114944,
                                average: 164.37993900822062,
                                std: 26.010079499756575
                            }, {
                                Label: 'Old',
                                pas: 12980.996970666974,
                                area: 1496.7676319940551,
                                aspect: 1.9185185185185185,
                                average: 155.27579392594646,
                                std: 28.416844030625626
                            }, {
                                Label: 'Young',
                                pas: 8402.006745559294,
                                area: 1788.302533363278,
                                aspect: 1.019704433497537,
                                average: 159.67405227626796,
                                std: 33.87920305083972
                            }]
                        }),
                        async: false
                    });
                });
                huiTest.openImage('copy');
                runs(function () {
                    girder.rest.restRequest({
                        url: 'item/' + huiTest.imageId() + '/metadata',
                        contentType: 'application/json',
                        processData: false,
                        method: 'PUT',
                        data: JSON.stringify({
                            gloms: [{
                                Label: 'Young',
                                pas: 11851.975039865125,
                                area: 2360.3514018844844,
                                aspect: 1.0686695278969958,
                                average: 156.98394786336002,
                                std: 31.21637278966411
                            }, {
                                Label: 'Old',
                                pas: 14936.277054529173,
                                area: 3136.911379889736,
                                aspect: 1.0586080586080586,
                                average: 156.36041872733267,
                                std: 25.653667101657856
                            }, {
                                Label: 'Old',
                                pas: 16794.292195370363,
                                area: 3383.7387179248767,
                                aspect: 1.08,
                                average: 162.33947155279122,
                                std: 29.727093069010945

                            }]
                        }),
                        async: false
                    });
                });
                huiTest.openImage('image');
                waitsFor(function () {
                    return $('#h-metadataplot-panel .s-panel-content').length;
                }, 'panel to exist');
            });
            it('Show a plot', function () {
                runs(function () {
                    $('.g-widget-metadata-plot-settings').click();
                });
                girderTest.waitForDialog();
                waitsFor(function () {
                    return $('#h-plot-series-x').length;
                }, 'dialog controls to exist');
                runs(function () {
                    $('#h-plot-series-x').val('data.gloms.0.pas');
                    $('#h-plot-series-y').val('data.gloms.0.area');
                    $('#h-plot-series-r').val('data.gloms.0.aspect');
                    $('#h-plot-series-c').val('data.gloms.0.label');
                    $('#h-plot-series-s').val('item.name');
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                waitsFor(function () {
                    return $('.plot-container.plotly').length;
                }, 'plot to show up');
                runs(function () {
                    /*
                    expect($('path[class=point]').length).toBe(6);
                    expect($('path[class=point]').eq(0).css('fill')).toBe('#a6cee3');
                    expect($('path[class=point]').eq(1).css('fill')).toBe('#a6cee3');
                    expect($('path[class=point]').eq(2).css('fill')).toBe('#1f78b4');
                    */
                });
            });
            it('Exclude neighboring data', function () {
                runs(function () {
                    $('.g-widget-metadata-plot-settings').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    // switch some other options, too.
                    $('#h-plot-series-r').val('data.gloms.0.label');
                    $('#h-plot-series-c').val('data.gloms.0.average');
                    $('#h-plot-folder').prop('checked', false);
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                waitsFor(function () {
                    return $('path[class=point]').length !== 6 && $('.plot-container.plotly').length;
                }, 'plot to show up');
                runs(function () {
                    expect($('path[class=point]').length).toBe(3);
                    // check that the colors have changed
                    /*
                    expect($('path[class=point]').eq(0).css('fill')).toBe('#fde724');
                    expect($('path[class=point]').eq(1).css('fill')).toBe('#440154');
                    expect($('path[class=point]').eq(2).css('fill')).toBe('#228c8c');
                    */
                });
            });
        });
    });
});
