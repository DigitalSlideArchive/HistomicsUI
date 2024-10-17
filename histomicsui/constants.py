from girder.settings import SettingDefault, SettingKey

TCGACollectionSettingKey = 'tcga.tcga_collection_id'

SettingDefault.defaults[SettingKey.BRAND_NAME] = 'HistomicsUI'


# Constants representing the setting keys for this plugin
class PluginSettings:
    HUI_DEFAULT_DRAW_STYLES = 'histomicsui.default_draw_styles'
    HUI_PANEL_LAYOUT = 'histomicsui.panel_layout'
    HUI_WEBROOT_PATH = 'histomicsui.webroot_path'
    HUI_ALTERNATE_WEBROOT_PATH = 'histomicsui.alternate_webroot_path'
    HUI_BRAND_NAME = 'histomicsui.brand_name'
    HUI_BRAND_COLOR = 'histomicsui.brand_color'
    HUI_BANNER_COLOR = 'histomicsui.banner_color'
    HUI_QUARANTINE_FOLDER = 'histomicsui.quarantine_folder'
    HUI_DELETE_ANNOTATIONS_AFTER_INGEST = 'histomicsui.delete_annotations_after_ingest'
    HUI_HELP_URL = 'histomicsui.help_url'
    HUI_HELP_TOOLTIP = 'histomicsui.help_tooltip'
    HUI_HELP_TEXT = 'histomicsui.help_text'
    HUI_LOGIN_TEXT = 'histomicsui.login_text'
    HUI_LOGIN_SESSION_EXPIRY_MINUTES = 'histomicsui.login_session_expiry_minutes'
