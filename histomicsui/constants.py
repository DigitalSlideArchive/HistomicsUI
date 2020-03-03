# -*- coding: utf-8 -*-

from girder.settings import SettingDefault, SettingKey

TCGACollectionSettingKey = 'tcga.tcga_collection_id'

SettingDefault.defaults[SettingKey.BRAND_NAME] = 'HistomicsUI'


# Constants representing the setting keys for this plugin
class PluginSettings(object):
    HUI_DEFAULT_DRAW_STYLES = 'histomicsui.default_draw_styles'
    HUI_WEBROOT_PATH = 'histomicsui.webroot_path'
    HUI_ALTERNATE_WEBROOT_PATH = 'histomicsui.alternate_webroot_path'
    HUI_BRAND_NAME = 'histomicsui.brand_name'
    HUI_BRAND_COLOR = 'histomicsui.brand_color'
    HUI_BANNER_COLOR = 'histomicsui.banner_color'
    HUI_QUARANTINE_FOLDER = 'histomicsui.quarantine_folder'
