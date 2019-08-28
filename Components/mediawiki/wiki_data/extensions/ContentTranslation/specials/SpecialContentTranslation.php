<?php
/**
 * Contains the special page Special:ContentTranslation.
 *
 * @copyright See AUTHORS.txt
 * @license GPL-2.0-or-later
 */

/**
 * Implements the core of the Content Translation extension:
 * a special page that shows Content Translation user interface.
 */
class SpecialContentTranslation extends ContentTranslationSpecialPage {
	function __construct() {
		parent::__construct( 'ContentTranslation' );
	}

	public function getDescription() {
		return $this->msg( 'cx' )->text();
	}

	public function isListed() {
		return ContentTranslationHooks::isEnabledForUser( $this->getUser() );
	}

	public function enableCXBetaFeature() {
		$user = $this->getUser();
		$out = $this->getOutput();
		$user->setOption( 'cx', '1' );
		// Promise to persist the setting post-send
		DeferredUpdates::addCallableUpdate( function () use ( $user ) {
			$user->saveSettings();
		} );
		$out->addModules( 'ext.cx.beta.notification' );
	}

	public function isValidCampaign( $campaign ) {
		global $wgContentTranslationCampaigns;

		if ( $this->getUser()->isAnon() ) {
			// Campaigns are only for logged in users.
			return false;
		}
		return $campaign !== null
			&& isset( $wgContentTranslationCampaigns[$campaign] )
			&& $wgContentTranslationCampaigns[$campaign];
	}

	/**
	 * Check if the request has a token to use CX.
	 * With a valid cx token override beta feature settings.
	 * @return bool
	 */
	public function hasToken() {
		$request = $this->getRequest();

		if ( $this->getUser()->isAnon() ) {
			// Tokens are valid only for logged in users.
			return false;
		}

		$title = $request->getVal( 'page' );

		if ( $title === null ) {
			return false;
		}

		// PHP mangles spaces so that foo%20bar is converted to foo_bar and that $_COOKIE['foo bar']
		// *does not* work. Go figure. It also mangles periods, so that foo.bar is converted to
		// foo_bar, but that *does* work because MediaWiki's getCookie transparently maps periods to
		// underscores. If there is any further bugs reported about this, please use base64.
		$title = strtr( $title, ' ', '_' );

		$token = implode( '_', [
			'cx',
			$title,
			$request->getVal( 'from' ),
			$request->getVal( 'to' ),
		] );

		return $request->getCookie( $token, '' ) !== null;
	}

	/**
	 * Check if the translation exist for the given language pairs
	 * and source title in the request.
	 * @return bool
	 */
	public function isExistingTranslation() {
		$request = $this->getRequest();
		$translation = ContentTranslation\Translation::find(
			$request->getVal( 'from' ),
			$request->getVal( 'to' ),
			$request->getVal( 'page' )
		);
		if ( $translation !== null ) {
			// Check if the translation belongs to the current user.
			$user = $this->getUser();
			$translator = new ContentTranslation\Translator( $user );
			return $translator->getGlobalUserId() ===
				intval( $translation->translation['lastUpdatedTranslator'] );
		}

		return false;
	}

	/**
	 * @inheritDoc
	 */
	protected function canUserProceed() {
		$hasToken = $this->hasToken();
		$campaign = $this->getRequest()->getVal( 'campaign' );
		$isCampaign = $this->isValidCampaign( $campaign );

		// Direct access, isListed only affects Special:SpecialPages
		if ( !ContentTranslationHooks::isEnabledForUser( $this->getUser() ) ) {
			if ( $hasToken || $isCampaign ) {
				// User has a token or a valid campaign param.
				// Enable cx for the user in this wiki.
				$this->enableCXBetaFeature();
			} else {
				if ( $campaign ) {
					// Show login page if the URL has campaign parameter
					$this->requireLogin();
				}
				// Invalid or missing campaign param
				$this->getOutput()->showErrorPage(
					'cx',
					'cx-specialpage-enable-betafeature',
					SpecialPage::getTitleFor( 'ContentTranslation' )
						->getCanonicalURL( [ 'campaign' => 'specialcx' ] )
				);
				return false;
			}
		}

		return true;
	}

	/**
	 * @inheritDoc
	 */
	protected function initModules() {
		global $wgContentTranslationTranslateInTarget, $wgContentTranslationVersion;

		$out = $this->getOutput();
		$request = $this->getRequest();

		$initModule = 'mw.cx.init.legacy';
		// If request has param to use CX OOjs based version, change init module.
		if ( (int)$request->getVal( 'version' ) === 2 || (int)$wgContentTranslationVersion === 2 ) {
			$initModule = 'mw.cx.init';
		}

		$isExistingTranslation = $this->isExistingTranslation();
		if ( $this->hasToken() || $isExistingTranslation ) {
			$out->addModules( $initModule );
			// If Wikibase is installed, load the module for linking
			// the published article with the source article
			if ( $wgContentTranslationTranslateInTarget && defined( 'WBC_VERSION' ) ) {
				$out->addModules( 'ext.cx.wikibase.link' );
			}
		} else {
			$out->addModules( 'ext.cx.dashboard' );
			$out->addMeta( 'viewport', 'width=device-width, initial-scale=1' );
		}
	}
}
