/**
* Classes to manage maps
*/

/**
* Map layer, could be tiled or whatever
*/
cdb.geo.MapLayer = cdb.core.Model.extend({

  defaults: {
    visible: true,
    type: 'Tiled'
  }

});

// Good old fashioned tile layer
cdb.geo.TileLayer = cdb.geo.MapLayer.extend({
  getTileLayer: function() {
  }
});

cdb.geo.GMapsBaseLayer = cdb.geo.MapLayer.extend({
  OPTIONS: ['roadmap', 'satellite', 'terrain', 'custom'],
  defaults: {
    type: 'GMapsBase',
    base_type: 'roadmap',
    style: null
  }
});

/**
 * this layer allows to put a plain color or image as layer (instead of tiles)
 */
cdb.geo.PlainLayer = cdb.geo.MapLayer.extend({
  defaults: {
    type: 'Plain',
    color: '#FFFFFF'
  }
});

// CartoDB layer
cdb.geo.CartoDBLayer = cdb.geo.MapLayer.extend({
  defaults: {
    type: 'CartoDB',
    active: true,
    query: null,
    opacity: 0.99,
    auto_bound: false,
    interactivity: null,
    debug: false,
    visible: true,
    tiler_domain: "cartodb.com",
    tiler_port: "80",
    tiler_protocol: "http",
    sql_domain: "cartodb.com",
    sql_port: "80",
    sql_protocol: "http",
    extra_params: {},
    cdn_url: null
  },

  activate: function() {
    this.set({active: true, opacity: 0.99, visible: true})
  },

  deactivate: function() {
    this.set({active: false, opacity: 0, visible: false})
  },

  toggle: function() {
    if(this.get('active')) {
      this.deactivate();
    } else {
      this.activate();
    }
  }
});

cdb.geo.Layers = Backbone.Collection.extend({

  model: cdb.geo.MapLayer,

  initialize: function() {
    this.bind('add remove', this._asignIndexes, this);
  },

  clone: function() {
    var layers = new cdb.geo.Layers();
    this.each(function(layer) {
      if(layer.clone) {
        var lyr = layer.clone();
        lyr.set('id', null);
        layers.add(lyr);
      } else {
        var attrs = _.clone(layer.attributes);
        delete attrs.id;
        layers.add(attrs);
      }
    });
    return layers;
  },

  /**
   * each time a layer is added or removed
   * the index should be recalculated
   */
  _asignIndexes: function() {
    for(var i = 0; i < this.size(); ++i) {
      this.models[i].set({ order: i }, { silent: true });
    }
  }
});

/**
* map model itself
*/
cdb.geo.Map = cdb.core.Model.extend({

  defaults: {
    center: [0, 0],
    zoom: 3,
    minZoom: 0,
    maxZoom: 20,
    provider: 'leaflet'
  },

  initialize: function() {
    this.layers = new cdb.geo.Layers();

    this.layers.bind('reset', function() {
      if(this.layers.size() >= 1) {
        this._adjustZoomtoLayer(this.layers.models[0]);
      }
    }, this);

    this.geometries = new cdb.geo.Geometries();
  },

  setView: function(latlng, zoom) {
    this.set({
      center: latlng,
      zoom: zoom
    }, {
      silent: true
    });
    this.trigger("set_view");
  },

  setZoom: function(z) {
    this.set({
      zoom: z
    });
  },

  getZoom: function() {
    return this.get('zoom');
  },

  setCenter: function(latlng) {
    this.set({
      center: latlng
    });
  },

  clone: function() {
    var m = new cdb.geo.Map(_.clone(this.attributes));
    // clone lists
    m.set({
      center: _.clone(this.attributes.center),
      bounding_box_sw: _.clone(this.attributes.bounding_box_sw),
      bounding_box_ne: _.clone(this.attributes.bounding_box_ne),
      view_bounds_sw: _.clone(this.attributes.view_bounds_sw),
      view_bounds_ne: _.clone(this.attributes.view_bounds_ne)
    });
    // layers
    m.layers = this.layers.clone();
    return m;

  },

  /**
  * Change multiple options at the same time
  * @params {Object} New options object
  */
  setOptions: function(options) {
    if (typeof options != "object" || options.length) {
      if (this.options.debug) {
        throw (options + ' options has to be an object');
      } else {
        return;
      }
    }

    // Set options
    _.defauls(this.options, options);

  },

  /**
   * return getViewbounds if it is set
   */
  getViewBounds: function() {
    if(this.has('view_bounds_sw') && this.has('view_bounds_ne')) {
      return [
        this.get('view_bounds_sw'),
        this.get('view_bounds_ne')
      ];
    }
    return null;
  },

  getLayerAt: function(i) {
    return this.layers.at(i);
  },

  getLayerByCid: function(cid) {
    return this.layers.getByCid(cid);
  },

  _adjustZoomtoLayer: function(layer) {
    //set zoom
    var z = layer.get('maxZoom');
    if(_.isNumber(z)) {
      this.set({ maxZoom: z });
    }
    z = layer.get('minZoom');
    if(_.isNumber(z)) {
      this.set({ minZoom: z });
    }
  },

  addLayer: function(layer, opts) {
    if(this.layers.size() == 0) {
      this._adjustZoomtoLayer(layer);
    }
    this.layers.add(layer, opts);
    return layer.cid;
  },

  removeLayer: function(layer) {
    this.layers.remove(layer);
  },

  removeLayerByCid: function(cid) {
    var layer = this.layers.getByCid(cid);

    if (layer) this.removeLayer(layer);
    else cdb.log.error("There's no layer with cid = " + cid + ".");
  },

  removeLayerAt: function(i) {
    var layer = this.layers.at(i);

    if (layer) this.removeLayer(layer);
    else cdb.log.error("There's no layer in that position.");
  },

  clearLayers: function() {
    while (this.layers.length > 0) {
      this.removeLayer(this.layers.at(0));
    }
  },

  // by default the base layer is the layer at index 0
  getBaseLayer: function() {
    return this.layers.at(0);
  },

  // remove current base layer and set the specified
  // current base layer is removed
  setBaseLayer: function(layer) {
    var old = this.layers.at(0);
    old.destroy();
    //this.layers.remove(old);
    this.layers.add(layer, { at: 0 });
    this._adjustZoomtoLayer(layer);
    return layer;
  },

  addGeometry: function(geom) {
    this.geometries.add(geom);
  },

  removeGeometry: function(geom) {
    this.geometries.remove(geom);
  }

});


/**
* Base view for all impl
*/
cdb.geo.MapView = cdb.core.View.extend({

  initialize: function() {

    if (this.options.map === undefined) {
      throw new Exception("you should specify a map model");
    }

    this.map = this.options.map;
    this.add_related_model(this.map);
    this.add_related_model(this.map.layers);

    // this var stores views information for each model
    this.layers = {};
    this.geometries = {};

    this.bind('clean', this._removeLayers, this);
  },

  render: function() {
    return this;
  },

  /**
   * add a infowindow to the map
   */
  addInfowindow: function(infoWindowView) {

    this.$el.append(infoWindowView.render().el);
    this.addView(infoWindowView);
  },

  /**
  * search in the subviews and return the infowindows
  */
  getInfoWindows: function() {
    var result = [];
    for (var s in this._subviews) {
      if(this._subviews[s] instanceof cdb.geo.ui.Infowindow) {
        result.push(this._subviews[s]);
      }
    }
    return result;
  },

  showBounds: function(bounds) {
    throw "to be implemented";
  },

  _removeLayers: function() {
    for(var layer in this.layers) {
      this.layers[layer].remove();
    }
    this.layers = {}
  },

  /**
  * set model property but unbind changes first in order to not create an infinite loop
  */
  _setModelProperty: function(prop) {
    this._unbindModel();
    this.map.set(prop);
    this._bindModel();
  },

  /** bind model properties */
  _bindModel: function() {
    this.map.bind('change:zoom',   this._setZoom, this);
    this.map.bind('change:center', this._setCenter, this);
  },

  /** unbind model properties */
  _unbindModel: function() {
    this.map.unbind('change:zoom',   this._setZoom, this);
    this.map.unbind('change:center', this._setCenter, this);
  },

  _addLayers: function() {
    var self = this;
    this.map.layers.each(function(lyr) {
      self._addLayer(lyr);
    });
  },

  _removeLayer: function(layer) {
    var layer_view = this.layers[layer.cid];
    if(layer_view) {
      layer_view.remove();
      delete this.layers[layer.cid];
    }
  },

  _removeGeometry: function(geo) {
    var geo_view = this.geometries[geo.cid];
    delete this.layers[layer.cid];
  },

  getLayerByCid: function(cid) {
    var l = this.layers[cid];
    if(!l) {
      cdb.log.error("layer with cid " + cid + " can't be get");
    }
    return l;
  },

  addGeometry: function(geom) {
    throw "to be implemented";
  },

  _setZoom: function(model, z) {
    throw "to be implemented";
  },

  _setCenter: function(model, center) {
    throw "to be implemented";
  },

  _addLayer: function(layer, layers, opts) {
    throw "to be implemented";
  }


}, {

  _getClass: function(provider) {
    var mapViewClass = cdb.geo.LeafletMapView;
    if(provider === 'googlemaps') {
        if(typeof(google) != "undefined" && typeof(google.maps) != "undefined") {
          mapViewClass = cdb.geo.GoogleMapsMapView;
        } else {
          cdb.log.error("you must include google maps library _before_ include cdb");
        }
    }
    return mapViewClass;
  },

  create: function(el, mapModel) {
    var _mapViewClass = cdb.geo.MapView._getClass(mapModel.get('provider'));
    return new _mapViewClass({
      el: el,
      map: mapModel
    });
  }
}
);
