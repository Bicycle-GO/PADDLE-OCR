import unittest
from backend.normalize import clipped_box, normalize_result


class NormalizeTests(unittest.TestCase):
    def test_polygon_coordinates_are_clamped(self):
        self.assertEqual(clipped_box([[-10, 5], [30, 5], [30, 40], [-10, 40]], 20, 50), {"x": 0., "y": 5., "w": 20., "h": 35.})
        self.assertIsNone(clipped_box([1, 1, 1, 1], 100, 100))
        self.assertIsNone(clipped_box([0, 0, float('nan'), 4], 100, 100))

    def test_chart_labels_are_not_exported_twice(self):
        result = {"layout_det_res": {"boxes": [{"label": "chart", "coordinate": [50, 50, 200, 150], "score": .95}]},
                  "overall_ocr_res": {"rec_texts": ["제목", "차트 내부"], "rec_scores": [.9, .8], "rec_boxes": [[10, 10, 100, 30], [70, 80, 120, 100]]}}
        layers = normalize_result(result, 300, 200)
        self.assertEqual(len(layers), 2)
        self.assertEqual(layers[0]["text"], "제목")
        self.assertEqual(layers[1]["type"], "image")

    def test_missing_confidence_is_unknown_not_perfect(self):
        result = {"res": {"overall_ocr_res": {"rec_texts": ["A"], "rec_boxes": [[0, 0, 20, 10]]}}}
        self.assertIsNone(normalize_result(result, 100, 100)[0]["confidence"])


if __name__ == '__main__':
    unittest.main()
