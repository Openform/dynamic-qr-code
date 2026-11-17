import {
  CircleHelpIcon,
  ClockIcon,
  ImageIcon,
  ImagesIcon,
  ListIcon,
  PanelTopIcon,
  PercentIcon,
  PointerIcon,
  ReceiptIcon,
  TextIcon
} from "@/app/components/icons"

/** The icon for each kind of block, in the block list and the Add a block picker. */
export const BLOCK_ICONS = {
  header: PanelTopIcon,
  text: TextIcon,
  buttons: PointerIcon,
  details: ListIcon,
  image: ImageIcon,
  gallery: ImagesIcon,
  offer: PercentIcon,
  prices: ReceiptIcon,
  hours: ClockIcon,
  faq: CircleHelpIcon
}

export function BlockIcon({ type, ...props }) {
  const Icon = BLOCK_ICONS[type] ?? TextIcon
  return <Icon {...props} />
}
