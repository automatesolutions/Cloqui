import { createCn } from "cn/config"

// Teach the class merger the Cloqui type scale. Without this, `text-callout` (a font size)
// is mistaken for a text colour and silently removes `text-on-brand` and friends.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "title-1",
            "title-2",
            "title-3",
            "headline",
            "body",
            "body-lg",
            "callout",
            "footnote",
            "caption",
          ],
        },
      ],
    },
  },
})
