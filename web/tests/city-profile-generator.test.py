import copy
import importlib.util
import pathlib
import unittest

PATH = pathlib.Path(__file__).resolve().parents[1] / 'scripts/generate-city-profiles.py'
SPEC = importlib.util.spec_from_file_location('city_profiles', PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ProvenanceGuardTests(unittest.TestCase):
    def test_homonym_is_rejected_even_when_the_name_matches(self):
        city = {'slug': 'georgetown', 'lat': 6.8, 'lon': -58.1}
        wrong = {'type': 'standard', 'coordinates': {'lat': 5.414, 'lon': 100.328}}
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            MODULE.validate_identity(city, wrong)

    def test_disambiguation_and_unlocated_source_are_rejected(self):
        city = {'slug': 'georgetown', 'lat': 6.8, 'lon': -58.1}
        for source in [{'type': 'disambiguation'}, {'type': 'standard'}]:
            with self.assertRaises(ValueError):
                MODULE.validate_identity(city, source)

    def test_a_claim_requires_every_actual_source_token(self):
        self.assertTrue(MODULE.supported({'evidence': ['Phewa', 'Annapurna']}, 'Phewa Lake beneath the Annapurna range'))
        self.assertFalse(MODULE.supported({'evidence': ['Phewa', 'GDP']}, 'Phewa Lake beneath the Annapurna range'))
        self.assertFalse(MODULE.supported({'evidence': []}, 'Any source'))
        self.assertTrue(MODULE.supported({'evidence': ['Cevapi']}, 'Ćevapi'))

    def test_undated_or_unscoped_numeric_city_facts_fail_validation(self):
        profile = {'schemaVersion': 1, 'slug': 'test', 'name': '测试', 'nameEn': 'Test', 'tagline': '测试城市',
                   'tags': [], 'geography': [], 'statistics': [], 'landmarks': [], 'culture': [],
                   'sources': [{'title': 'Source', 'url': 'https://example.org/city', 'date': '2026-10-27'}]}
        for note in ['', '2021 年', '全市行政区']:
            candidate = copy.deepcopy(profile)
            candidate['statistics'] = [{'label': '人口', 'value': '100 万', 'note': note}]
            with self.assertRaisesRegex(ValueError, 'year and administrative scope'):
                MODULE.validate_profile(candidate)
        profile['statistics'] = [{'label': '人口', 'value': '100 万', 'note': '2021 年普查；全市行政区'}]
        MODULE.validate_profile(profile)


if __name__ == '__main__':
    unittest.main()
