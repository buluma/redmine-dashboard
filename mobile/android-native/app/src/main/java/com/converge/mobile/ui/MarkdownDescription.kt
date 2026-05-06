package com.converge.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import org.commonmark.node.BulletList
import org.commonmark.node.Code
import org.commonmark.node.Document
import org.commonmark.node.Emphasis
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.HardLineBreak
import org.commonmark.node.Heading
import org.commonmark.node.Link
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.SoftLineBreak
import org.commonmark.node.StrongEmphasis
import org.commonmark.node.Text as MarkdownTextNode
import org.commonmark.node.ThematicBreak
import org.commonmark.parser.Parser

private val markdownParser = Parser.builder().build()

@Composable
fun MarkdownDescription(markdown: String, modifier: Modifier = Modifier) {
    val document = remember(markdown) { markdownParser.parse(markdown) as Document }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        var node = document.firstChild
        while (node != null) {
            MarkdownBlock(node)
            node = node.next
        }
    }
}

@Composable
private fun MarkdownBlock(node: Node) {
    when (node) {
        is Heading -> Text(
            text = inlineText(node),
            style = when (node.level) {
                1 -> MaterialTheme.typography.titleLarge
                2 -> MaterialTheme.typography.titleMedium
                else -> MaterialTheme.typography.titleSmall
            },
            fontWeight = FontWeight.SemiBold,
        )

        is Paragraph -> Text(
            text = inlineText(node),
            style = MaterialTheme.typography.bodyMedium,
        )

        is BulletList -> MarkdownList(node, ordered = false)
        is OrderedList -> MarkdownList(node, ordered = true)

        is FencedCodeBlock -> Text(
            text = node.literal.trimEnd(),
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            modifier = Modifier
                .background(Color(0xFFF1F5F9), RoundedCornerShape(8.dp))
                .padding(12.dp),
        )

        is ThematicBreak -> Text("------", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        else -> Text(text = inlineText(node), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun MarkdownList(node: Node, ordered: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        var index = 1
        var child = node.firstChild
        while (child != null) {
            if (child is ListItem) {
                val prefix = if (ordered) "${index}." else "-"
                Text(
                    text = buildAnnotatedString {
                        append(prefix)
                        append(" ")
                        append(inlineText(child))
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
                index += 1
            }
            child = child.next
        }
    }
}

private fun inlineText(node: Node): AnnotatedString = buildAnnotatedString {
    appendNode(node)
}

private fun AnnotatedString.Builder.appendChildren(node: Node) {
    var child = node.firstChild
    while (child != null) {
        appendNode(child)
        child = child.next
    }
}

private fun AnnotatedString.Builder.appendNode(node: Node) {
    when (node) {
        is MarkdownTextNode -> append(node.literal)
        is Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Color(0xFFE2E8F0))) {
            append(node.literal)
        }

        is SoftLineBreak -> append(" ")
        is HardLineBreak -> append("\n")
        is Emphasis -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
            appendChildren(node)
        }

        is StrongEmphasis -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
            appendChildren(node)
        }

        is Link -> withStyle(SpanStyle(color = Color(0xFF0F766E), textDecoration = TextDecoration.Underline)) {
            appendChildren(node)
        }
        else -> appendChildren(node)
    }
}
