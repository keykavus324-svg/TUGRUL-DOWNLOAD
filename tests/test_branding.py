"""Checks user-visible fork branding without changing compatibility identifiers."""
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / 'app/src/main/res'
ANDROID = '{http://schemas.android.com/apk/res/android}'
APP = '{http://schemas.android.com/apk/res-auto}'

class BrandingTest(unittest.TestCase):
    def test_application_name_and_navigation(self):
        strings = ET.parse(RES / 'values/strings.xml').getroot()
        self.assertEqual(strings.find("string[@name='app_name']").text, 'TUĞRUL DOWNLOAD')
        manifest = ET.parse(ROOT / 'app/src/main/AndroidManifest.xml').getroot()
        self.assertEqual(manifest.find('application').get(ANDROID + 'label'), '@string/app_name')
        header = ET.parse(RES / 'layout/header_navigation_drawer.xml').getroot()
        self.assertTrue(any(node.get(ANDROID + 'text') == '@string/app_name' for node in header.iter()))

    def test_about_links_and_backup_preferences(self):
        root = ET.parse(RES / 'xml/root_preferences.xml').getroot()
        keys = {node.get(APP + 'key') for node in root.iter()}
        self.assertTrue({'backup', 'restore', 'automatic_backup', 'upstream_source', 'rreth'} <= keys)
        self.assertTrue({'discord', 'telegram', 'security'}.isdisjoint(keys))
        source = next(node for node in root.iter() if node.get(APP + 'key') == 'rreth')
        self.assertEqual(source.find('intent').get(ANDROID + 'data'), 'https://github.com/keykavus324-svg/TUGRUL-DOWNLOAD')

    def test_launcher_contrast_and_all_xml_well_formed(self):
        colors = ET.parse(RES / 'values/colors.xml').getroot()
        self.assertEqual(colors.find("color[@name='icon_bg']").text, '#10244B')
        for xml in RES.rglob('*.xml'):
            with self.subTest(path=str(xml)):
                ET.parse(xml)

if __name__ == '__main__':
    unittest.main()
