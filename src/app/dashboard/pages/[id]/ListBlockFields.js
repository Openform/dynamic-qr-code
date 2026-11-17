"use client"

import { PAGE_LIMITS } from "@/lib/campaignPages"
import { PHOTO_MAX_SIDE } from "@/lib/imageResize"
import { move } from "@/lib/pageEditing"
import { AddPhotoButton, ImageField, SubItemHead, TextField } from "./fields"
import styles from "../pages.module.css"

/**
 * The fields of the blocks that hold a list: FAQ (questions and answers),
 * Price list (items and prices) and Gallery (photos). Paths in `errorFor`
 * follow lib/campaignPages.js, e.g. "blocks.3.items.0.question".
 */

/**
 * A block's list of items, each in its own box with arrows and a remove
 * button, and `addButton` under them while there's room for more.
 */
function ItemList({ block, path, onChange, errorFor, name, max, canRemoveLast = false, addButton, children }) {
  const items = block.items ?? []
  const setItems = (next) => onChange({ ...block, items: next })
  const setItem = (index, next) => setItems(items.map((item, i) => (i === index ? next : item)))
  return (
    <>
      {errorFor(`${path}.items`) && <p className={styles.fieldError}>{errorFor(`${path}.items`)}</p>}
      {items.map((item, index) => (
        <div key={index} className={styles.subItem}>
          <SubItemHead
            name={name}
            title={`${name.charAt(0).toUpperCase()}${name.slice(1)} ${index + 1}`}
            index={index}
            count={items.length}
            canRemoveLast={canRemoveLast}
            onMove={(step) => setItems(move(items, index, step))}
            onRemove={() => setItems(items.filter((_, i) => i !== index))}
          />
          {children({
            item,
            index,
            itemPath: `${path}.items.${index}`,
            id: (key) => `${block.id}-item-${index}-${key}`,
            set: (key) => (value) => setItem(index, { ...item, [key]: value }),
            remove: () => setItems(items.filter((_, i) => i !== index))
          })}
        </div>
      ))}
      {items.length < max && addButton(setItems, items)}
    </>
  )
}

function AddButton({ onClick, children }) {
  return (
    <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={onClick}>
      {children}
    </button>
  )
}

function HeadingField({ block, path, onChange, errorFor, placeholder, hint }) {
  return (
    <TextField
      id={`${block.id}-title`}
      label="Heading (optional)"
      value={block.title}
      onChange={(title) => onChange({ ...block, title })}
      max={PAGE_LIMITS.blockTitle}
      placeholder={placeholder}
      error={errorFor(`${path}.title`)}
      hint={hint}
    />
  )
}

export function FaqFields({ block, path, onChange, errorFor }) {
  return (
    <>
      <HeadingField block={block} path={path} onChange={onChange} errorFor={errorFor} placeholder="Questions" />
      <ItemList
        block={block}
        path={path}
        onChange={onChange}
        errorFor={errorFor}
        name="question"
        max={PAGE_LIMITS.faqItems}
        addButton={(setItems, items) => <AddButton onClick={() => setItems([...items, { question: "", answer: "" }])}>+ Add question</AddButton>}
      >
        {({ item, itemPath, id, set }) => (
          <>
            <TextField id={id("question")} label="Question" value={item.question} onChange={set("question")} max={PAGE_LIMITS.faqQuestion} placeholder="Do you deliver?" error={errorFor(`${itemPath}.question`)} />
            <TextField
              id={id("answer")}
              label="Answer"
              value={item.answer}
              onChange={set("answer")}
              max={PAGE_LIMITS.faqAnswer}
              multiline
              rows={3}
              placeholder="Yes, within 10 km, from R40."
              error={errorFor(`${itemPath}.answer`)}
              hint="Visitors tap the question to see this. **bold**, *italic* and [links](https://example.com) work here too."
            />
          </>
        )}
      </ItemList>
    </>
  )
}

export function PricesFields({ block, path, onChange, errorFor }) {
  return (
    <>
      <HeadingField
        block={block}
        path={path}
        onChange={onChange}
        errorFor={errorFor}
        placeholder="Coffee"
        hint="For a menu with sections, add a Price list for each, like Coffee and Breakfast."
      />
      <ItemList
        block={block}
        path={path}
        onChange={onChange}
        errorFor={errorFor}
        name="item"
        max={PAGE_LIMITS.priceItems}
        addButton={(setItems, items) => (
          <AddButton onClick={() => setItems([...items, { name: "", price: "", description: "", tag: "" }])}>+ Add item</AddButton>
        )}
      >
        {({ item, itemPath, id, set }) => (
          <>
            <div className={styles.fieldRow}>
              <TextField id={id("name")} label="Name" value={item.name} onChange={set("name")} max={PAGE_LIMITS.priceName} placeholder="Flat white" error={errorFor(`${itemPath}.name`)} />
              <div className={styles.narrowField}>
                <TextField id={id("price")} label="Price (optional)" value={item.price} onChange={set("price")} max={PAGE_LIMITS.price} placeholder="R38" error={errorFor(`${itemPath}.price`)} />
              </div>
            </div>
            <div className={styles.fieldRow}>
              <TextField
                id={id("description")}
                label="Description (optional)"
                value={item.description}
                onChange={set("description")}
                max={PAGE_LIMITS.priceDescription}
                placeholder="Double shot, with oat milk if you like"
                error={errorFor(`${itemPath}.description`)}
              />
              <div className={styles.narrowField}>
                <TextField id={id("tag")} label="Tag (optional)" value={item.tag} onChange={set("tag")} max={PAGE_LIMITS.priceTag} placeholder="New" error={errorFor(`${itemPath}.tag`)} />
              </div>
            </div>
          </>
        )}
      </ItemList>
    </>
  )
}

export function GalleryFields({ block, path, onChange, errorFor, images, onUpload }) {
  const count = block.items?.length ?? 0
  return (
    <>
      <p className={styles.hint}>
        Up to {PAGE_LIMITS.galleryImages} photos. Visitors swipe through them, and each is cropped to the same shape (4:3).
        {count === 0 ? " Until a photo is added, this block isn’t shown on the page." : ""}
      </p>
      <ItemList
        block={block}
        path={path}
        onChange={onChange}
        errorFor={errorFor}
        name="photo"
        max={PAGE_LIMITS.galleryImages}
        canRemoveLast
        addButton={(setItems, items) => (
          <AddPhotoButton
            id={`${block.id}-add`}
            label={items.length === 0 ? "Upload a photo" : "+ Add photo"}
            maxSide={PHOTO_MAX_SIDE}
            onUpload={onUpload}
            onAdd={(image) => setItems([...items, { image, alt: "" }])}
          />
        )}
      >
        {({ item, itemPath, id, set, remove }) => (
          <div className={styles.fieldRow}>
            <ImageField
              id={id("image")}
              label="Photo"
              value={item.image}
              images={images}
              onChange={(image) => (image ? set("image")(image) : remove())}
              onUpload={onUpload}
              maxSide={PHOTO_MAX_SIDE}
              error={errorFor(`${itemPath}.image`)}
            />
            <TextField id={id("alt")} label="What it shows (for screen readers)" value={item.alt} onChange={set("alt")} max={PAGE_LIMITS.imageAlt} error={errorFor(`${itemPath}.alt`)} />
          </div>
        )}
      </ItemList>
    </>
  )
}
