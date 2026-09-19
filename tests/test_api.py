import unittest
from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image
from backend.app import app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        buffer = BytesIO()
        Image.new('RGB', (100, 60), 'white').save(buffer, 'PNG')
        self.png = buffer.getvalue()

    def test_health_does_not_load_a_model(self):
        with patch('backend.app.ocr_available', return_value=False):
            result = self.client.get('/api/health')
            self.assertEqual(result.status_code, 200)
            self.assertFalse(result.json()['ocr_available'])

    def test_missing_engine_is_explicit(self):
        with patch('backend.app.ocr_available', return_value=False):
            result = self.client.post('/api/analyze', files={'file': ('slide.png', self.png, 'image/png')})
            self.assertEqual(result.status_code, 503)
            self.assertIn('설치', result.json()['detail'])

    def test_invalid_file_and_language_are_rejected(self):
        invalid = self.client.post('/api/analyze', files={'file': ('slide.png', b'not an image', 'image/png')})
        self.assertEqual(invalid.status_code, 415)
        language = self.client.post('/api/analyze', files={'file': ('slide.png', self.png, 'image/png')}, data={'language': 'invalid'})
        self.assertEqual(language.status_code, 422)

    def test_valid_upload_reaches_inference_with_original_dimensions(self):
        with patch('backend.app.predict', side_effect=lambda image, language: {'width': image.width, 'height': image.height, 'language': language, 'layers': []}):
            result = self.client.post('/api/analyze', files={'file': ('slide.png', self.png, 'image/png')}, data={'language': 'korean'})
            self.assertEqual(result.json(), {'width': 100, 'height': 60, 'language': 'korean', 'layers': []})


if __name__ == '__main__':
    unittest.main()
