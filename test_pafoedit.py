import unittest

from pafoedit import MAX_COLUMNS, TAB_SPACES, char_columns, overflow_index


class CharColumnsTest(unittest.TestCase):
    def test_ascii_is_one_column(self):
        self.assertEqual(char_columns("A"), 1)
        self.assertEqual(char_columns("0"), 1)

    def test_wide_and_fullwidth_are_two_columns(self):
        self.assertEqual(char_columns("あ"), 2)
        self.assertEqual(char_columns("漢"), 2)
        self.assertEqual(char_columns("Ａ"), 2)
        self.assertEqual(char_columns("\u3000"), 2)

    def test_ambiguous_width_is_one_column(self):
        self.assertEqual(char_columns("①"), 1)
        self.assertEqual(char_columns("→"), 1)

    def test_combining_and_format_characters_are_zero(self):
        self.assertEqual(char_columns("\u0301"), 0)
        self.assertEqual(char_columns("\u3099"), 0)
        self.assertEqual(char_columns("\u200d"), 0)
        self.assertEqual(char_columns("e") + char_columns("\u0301"), 1)

    def test_newline_is_not_counted(self):
        self.assertEqual(char_columns("\n"), 0)

    def test_tab_never_occupies_the_grid(self):
        self.assertEqual(TAB_SPACES, 4)
        self.assertEqual(char_columns("\t"), 1)


class OverflowIndexTest(unittest.TestCase):
    def test_exactly_at_limit_has_no_overflow(self):
        self.assertIsNone(overflow_index("0" * MAX_COLUMNS))

    def test_first_character_past_limit(self):
        self.assertEqual(overflow_index("0" * (MAX_COLUMNS + 1)), MAX_COLUMNS)

    def test_ten_wide_characters_fill_the_line(self):
        self.assertIsNone(overflow_index("あ" * 10))

    def test_wide_character_ending_exactly_at_limit_fits(self):
        self.assertIsNone(overflow_index("0" * 18 + "あ"))

    def test_wide_character_crossing_limit_is_overflow(self):
        self.assertEqual(overflow_index("0" * 19 + "あ"), 19)

    def test_ideographic_space_counts_as_two_columns(self):
        self.assertIsNone(overflow_index("あ" * 9 + "\u3000"))
        self.assertEqual(overflow_index("あ" * 9 + "\u3000" + "0"), 10)

    def test_zero_width_character_after_limit_does_not_overflow(self):
        self.assertIsNone(overflow_index("0" * MAX_COLUMNS + "\u0301"))

    def test_zero_width_character_after_overflow_belongs_to_overflow(self):
        self.assertEqual(overflow_index("0" * MAX_COLUMNS + "\u0301" + "0"), MAX_COLUMNS + 1)


if __name__ == "__main__":
    unittest.main()
