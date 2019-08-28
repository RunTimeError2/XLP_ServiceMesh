'use strict';

/**
 * Sentence translation unit
 *
 * @class
 * @param {mw.cx.dm.TranslationUnit} model
 * @param {mw.cx.tools.TranslationToolFactory} toolFactory
 * @param {Object} config
 */
mw.cx.ui.SentenceTranslationUnit = function MwCxUiSentenceTranslationUnit( model, toolFactory, config ) {
	mw.cx.ui.SentenceTranslationUnit.super.call( this, model, toolFactory, config );
};

/* Setup */
OO.inheritClass( mw.cx.ui.SentenceTranslationUnit, mw.cx.ui.TranslationUnit );

mw.cx.ui.SentenceTranslationUnit.static.name = 'sentence';
mw.cx.ui.SentenceTranslationUnit.static.matchTagNames = [ 'span' ];
mw.cx.ui.SentenceTranslationUnit.static.tools = {};

/**
 * @inheritDoc
 */
mw.cx.ui.SentenceTranslationUnit.static.matchFunction = function ( node ) {
	return node.className === 'cx-segment';
};

/**
 * Get the translation section
 * @return {jQuery} The translation section
 */
mw.cx.ui.SentenceTranslationUnit.prototype.getTranslationSection = function () {
	var $section;

	if ( this.model.targetDocument ) {
		$section = this.parentTranslationUnit.$translationSection
			.find( '[data-segmentid="' + this.model.getTranslationSectionId() + '"]' );
	}
	if ( !$section || !$section.length ) {
		// Fallback to copy of source section
		$section = this.parentTranslationUnit.$translationSection.find( '[data-segmentid="' + this.model.getSectionId() + '"]' );
	}
	return $section;
};

mw.cx.ui.translationUnitFactory.register( mw.cx.ui.SentenceTranslationUnit );
