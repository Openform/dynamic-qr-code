import { Fragment } from "react"
import Link from "next/link"
import { parseMarkdown } from "@/lib/markdown"
import styles from "./FormattedText.module.css"

/**
 * Render text written with the formatting in lib/markdown.js (headings,
 * bold, italic, lists, links). Everything is built as React elements, never
 * raw HTML. Used by the legal pages and the admin editor's preview.
 */
export default function FormattedText({ content }) {
  const blocks = parseMarkdown(content)
  return (
    <div className={styles.prose}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}

function Block({ block }) {
  if (block.type === "heading") {
    const Heading = block.level === 3 ? "h3" : "h2"
    return (
      <Heading id={block.id}>
        <Inline nodes={block.children} />
      </Heading>
    )
  }

  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul"
    return (
      <List start={block.ordered && block.start !== 1 ? block.start : undefined}>
        {block.items.map((lines, index) => (
          <li key={index}>
            <Lines lines={lines} />
          </li>
        ))}
      </List>
    )
  }

  return (
    <p>
      <Lines lines={block.lines} />
    </p>
  )
}

/** Lines of one paragraph or list item, with line breaks between them. */
function Lines({ lines }) {
  return lines.map((nodes, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      <Inline nodes={nodes} />
    </Fragment>
  ))
}

function Inline({ nodes }) {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "strong":
        return (
          <strong key={index}>
            <Inline nodes={node.children} />
          </strong>
        )
      case "em":
        return (
          <em key={index}>
            <Inline nodes={node.children} />
          </em>
        )
      case "link":
        return (
          <TextLink key={index} href={node.href}>
            <Inline nodes={node.children} />
          </TextLink>
        )
      default:
        return <Fragment key={index}>{node.text}</Fragment>
    }
  })
}

/** Site pages use client-side navigation; other websites open in a new tab. */
function TextLink({ href, children }) {
  if (href.startsWith("/") || href.startsWith("#")) {
    return <Link href={href}>{children}</Link>
  }
  if (/^https?:/i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  return <a href={href}>{children}</a>
}
